import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Assignment, Person, Project, PeriodType } from "@shared/types";
import { Card, CardBody } from "../components/Card";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { Badge, Field, Input, Select } from "../components/ui";

export default function StaffingPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Assignment | null>(null);

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

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Staffing</h1>
          <p className="text-sm text-slate-500">{assignments.length} assegnazioni attive</p>
        </div>
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

function AssignmentModal({
  open,
  onClose,
  assignment,
  people,
  projects,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  assignment: Assignment | null;
  people: Person[];
  projects: Project[];
  onSaved: () => void;
}) {
  const [personId, setPersonId] = useState<number | "">("");
  const [projectId, setProjectId] = useState<number | "">("");
  const [percentage, setPercentage] = useState(100);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [periodType, setPeriodType] = useState<PeriodType>("week");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (assignment) {
      setPersonId(assignment.personId);
      setProjectId(assignment.projectId);
      setPercentage(assignment.percentage);
      setStartDate(assignment.startDate);
      setEndDate(assignment.endDate);
      setPeriodType(assignment.periodType);
    } else {
      setPersonId(people[0]?.id ?? "");
      setProjectId(projects[0]?.id ?? "");
      setPercentage(100);
      setStartDate("");
      setEndDate("");
      setPeriodType("week");
    }
  }, [assignment, open, people, projects]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (personId === "" || projectId === "") return;
    setSaving(true);
    const payload = {
      personId: Number(personId),
      projectId: Number(projectId),
      percentage,
      startDate,
      endDate,
      periodType,
    };
    try {
      if (assignment) {
        await api.put(`/assignments/${assignment.id}`, payload);
      } else {
        await api.post("/assignments", payload);
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={assignment ? "Modifica assegnazione" : "Nuova assegnazione"}>
      <form onSubmit={handleSubmit}>
        <Field label="Persona">
          <Select value={personId} onChange={(e) => setPersonId(Number(e.target.value))} required>
            <option value="" disabled>
              Seleziona…
            </option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Progetto">
          <Select value={projectId} onChange={(e) => setProjectId(Number(e.target.value))} required>
            <option value="" disabled>
              Seleziona…
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Percentuale allocazione">
          <Input
            type="number"
            min={1}
            max={200}
            value={percentage}
            onChange={(e) => setPercentage(Number(e.target.value))}
            required
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data inizio">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </Field>
          <Field label="Data fine">
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
          </Field>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Salvataggio…" : "Salva"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
