import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { Absence, AbsenceStatus, AbsenceType, Person } from "@shared/types";
import Button from "./Button";
import Modal from "./Modal";
import { Field, Input, Select } from "./ui";

export const ABSENCE_TYPES: AbsenceType[] = ["ferie", "malattia", "permesso", "formazione", "altro"];

export const ABSENCE_LABEL: Record<AbsenceType, string> = {
  ferie: "Ferie",
  malattia: "Malattia",
  permesso: "Permesso",
  formazione: "Formazione",
  altro: "Altro",
};

export const ABSENCE_COLOR: Record<AbsenceType, string> = {
  ferie: "#059669",
  malattia: "#dc2626",
  permesso: "#0891b2",
  formazione: "#7c3aed",
  altro: "#64748b",
};

export const ABSENCE_STATUSES: AbsenceStatus[] = ["in_attesa", "approvata", "rifiutata"];

export const ABSENCE_STATUS_LABEL: Record<AbsenceStatus, string> = {
  in_attesa: "In attesa",
  approvata: "Approvata",
  rifiutata: "Rifiutata",
};

export const ABSENCE_STATUS_COLOR: Record<AbsenceStatus, string> = {
  in_attesa: "#d97706",
  approvata: "#059669",
  rifiutata: "#dc2626",
};

// Stable reference, same reasoning as AssignmentModal's NO_PEOPLE:
// a freshly-allocated `[]` default would retrigger the seeding effect on every render.
const NO_PEOPLE: Person[] = [];

export default function AbsenceModal({
  open,
  onClose,
  absence,
  people = NO_PEOPLE,
  lockedPerson,
  defaultStartDate,
  defaultEndDate,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  absence: Absence | null;
  people?: Person[];
  lockedPerson?: { id: number; name: string };
  defaultStartDate?: string;
  defaultEndDate?: string;
  onSaved: () => void;
}) {
  const [personId, setPersonId] = useState<number | "">("");
  const [type, setType] = useState<AbsenceType>("ferie");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [hours, setHours] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (absence) {
      setPersonId(absence.personId);
      setType(absence.type);
      setStartDate(absence.startDate);
      setEndDate(absence.endDate);
      setHours(absence.hours == null ? "" : String(absence.hours));
      setNotes(absence.notes ?? "");
    } else {
      setPersonId(lockedPerson ? lockedPerson.id : people[0]?.id ?? "");
      setType("ferie");
      setStartDate(defaultStartDate ?? "");
      setEndDate(defaultEndDate ?? "");
      setHours("");
      setNotes("");
    }
  }, [absence, open, people, lockedPerson, defaultStartDate, defaultEndDate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (personId === "") return;
    setSaving(true);
    const payload = {
      personId: Number(personId),
      type,
      startDate,
      endDate,
      hours: hours ? Number(hours) : null,
      notes: notes || null,
    };
    try {
      if (absence) {
        await api.put(`/absences/${absence.id}`, payload);
      } else {
        await api.post("/absences", payload);
      }
      onSaved();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Errore durante il salvataggio dell'assenza.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={absence ? "Modifica assenza" : "Nuova assenza"}>
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
        <Field label="Tipo">
          <Select value={type} onChange={(e) => setType(e.target.value as AbsenceType)}>
            {ABSENCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {ABSENCE_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data inizio">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </Field>
          <Field label="Data fine">
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
          </Field>
        </div>
        <Field label="Ore (opzionale, per assenza oraria nella giornata selezionata)">
          <Input type="number" min={0.5} max={24} step={0.5} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Lascia vuoto per giorni interi" />
        </Field>
        <Field label="Note">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Facoltativo" />
        </Field>

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
