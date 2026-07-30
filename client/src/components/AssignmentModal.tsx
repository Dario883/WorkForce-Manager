import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { Assignment, Person, Project, PeriodType } from "@shared/types";
import Button from "./Button";
import Modal from "./Modal";
import { Field, Input, Select } from "./ui";
import { STATUS_LABEL } from "./ProjectModal";

// Stable reference: a fresh `[]` default value would recreate the array on
// every render, and since `people` is a useEffect dependency below, that
// caused the effect to re-fire on every keystroke — resetting the form back
// to its defaults right after each edit.
const NO_PEOPLE: Person[] = [];

export default function AssignmentModal({
  open,
  onClose,
  assignment,
  people = NO_PEOPLE,
  projects,
  onSaved,
  lockedPerson,
  defaultStartDate,
  defaultEndDate,
}: {
  open: boolean;
  onClose: () => void;
  assignment: Assignment | null;
  people?: Person[];
  projects: Project[];
  onSaved: () => void;
  lockedPerson?: { id: number; name: string };
  defaultStartDate?: string;
  defaultEndDate?: string;
}) {
  const [personId, setPersonId] = useState<number | "">("");
  const [projectId, setProjectId] = useState<number | "">("");
  const [percentage, setPercentage] = useState(100);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [periodType, setPeriodType] = useState<PeriodType>("week");
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"new" | "overwrite">("new");

  useEffect(() => {
    if (assignment) {
      setPersonId(assignment.personId);
      setProjectId(assignment.projectId);
      setPercentage(assignment.percentage);
      setStartDate(assignment.startDate);
      setEndDate(assignment.endDate);
      setPeriodType(assignment.periodType);
    } else {
      setPersonId(lockedPerson ? lockedPerson.id : people[0]?.id ?? "");
      setProjectId(projects[0]?.id ?? "");
      setPercentage(100);
      setStartDate(defaultStartDate ?? "");
      setEndDate(defaultEndDate ?? "");
      setPeriodType("week");
      setMode("new");
    }
  }, [assignment, open, people, projects, lockedPerson, defaultStartDate, defaultEndDate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (personId === "" || projectId === "") return;

    const project = projects.find((p) => p.id === projectId);
    if (project && project.status !== "active") {
      const proceed = confirm(
        `Stai allocando una risorsa su un progetto in stato "${STATUS_LABEL[project.status]}". Vuoi continuare?`
      );
      if (!proceed) return;
    }

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
      const existing = await api.get<Assignment[]>(`/assignments?personId=${personId}`);
      const overlapPercentage = existing
        .filter((a) => {
          if (a.id === assignment?.id) return false;
          // Rows for the same project will be truncated/replaced by the
          // overwrite endpoint, so they shouldn't count towards the total.
          if (mode === "overwrite" && !assignment && a.projectId === Number(projectId)) return false;
          return a.startDate <= endDate && a.endDate >= startDate;
        })
        .reduce((sum, a) => sum + a.percentage, 0);
      const projectedTotal = overlapPercentage + percentage;
      if (projectedTotal > 100) {
        const proceed = confirm(
          `La risorsa risulterebbe allocata al ${projectedTotal}% nel periodo selezionato (oltre il 100%). Vuoi continuare?`
        );
        if (!proceed) return;
      }

      if (assignment) {
        await api.put(`/assignments/${assignment.id}`, payload);
      } else if (mode === "overwrite") {
        await api.post("/assignments/overwrite", payload);
      } else {
        await api.post("/assignments", payload);
      }
      onSaved();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Errore durante il salvataggio dell'assegnazione.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={assignment ? "Modifica assegnazione" : "Nuova assegnazione"}>
      <form onSubmit={handleSubmit}>
        <Field label="Persona">
          {lockedPerson ? (
            <p className="rounded-md border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/40 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
              {lockedPerson.name}
            </p>
          ) : (
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
          )}
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
        {!assignment && (
          <Field label="Se il progetto ha già un'assegnazione in questo periodo">
            <div className="flex rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-0.5">
              {(
                [
                  { value: "new" as const, label: "Crea nuova riga" },
                  { value: "overwrite" as const, label: "Sovrascrivi esistente" },
                ]
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMode(opt.value)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium ${
                    mode === opt.value ? "bg-brand-500 text-white" : "text-slate-600 dark:text-slate-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Field>
        )}
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
