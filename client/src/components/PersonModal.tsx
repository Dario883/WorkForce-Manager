import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Person } from "@shared/types";
import Button from "./Button";
import Modal from "./Modal";
import { Field, Input, Select } from "./ui";

const COLORS = ["#3457d5", "#059669", "#d97706", "#dc2626", "#7c3aed", "#0891b2"];

// Stable reference: see AssignmentModal's NO_PEOPLE for why a fresh `[]`
// default would be unsafe as a useEffect dependency.
const NO_PEOPLE: Person[] = [];

export default function PersonModal({
  open,
  onClose,
  person,
  people = NO_PEOPLE,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  person: Person | null;
  people?: Person[];
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [capacity, setCapacity] = useState(40);
  const [managerId, setManagerId] = useState<number | "">("");
  const [isApprover, setIsApprover] = useState(false);
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (person) {
      setName(person.name);
      setEmail(person.email ?? "");
      setRole(person.role ?? "");
      setCapacity(person.capacityHoursPerWeek);
      setManagerId(person.managerId ?? "");
      setIsApprover(person.isApprover);
      setColor(person.avatarColor);
    } else {
      setName("");
      setEmail("");
      setRole("");
      setCapacity(40);
      setManagerId("");
      setIsApprover(false);
      setColor(COLORS[Math.floor(Math.random() * COLORS.length)]);
    }
  }, [person, open]);

  // Approvers are the normal pool, but the person's current manager stays
  // visible in the list even if they've since lost the flag — otherwise the
  // select would silently show a blank/mismatched value.
  const managerOptions = people.filter(
    (p) => p.id !== person?.id && (p.isApprover || p.id === person?.managerId)
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      name,
      email: email || null,
      role: role || null,
      capacityHoursPerWeek: capacity,
      managerId: managerId === "" ? null : managerId,
      isApprover,
      avatarColor: color,
    };
    try {
      if (person) {
        await api.put(`/people/${person.id}`, payload);
      } else {
        await api.post("/people", payload);
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={person ? "Modifica persona" : "Nuova persona"}>
      <form onSubmit={handleSubmit}>
        <Field label="Nome">
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Ruolo">
          <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="es. Developer" />
        </Field>
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Capacità (ore/settimana)">
          <Input
            type="number"
            min={1}
            max={80}
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
          />
        </Field>
        <label className="mb-3 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            checked={isApprover}
            onChange={(e) => setIsApprover(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600"
          />
          È responsabile (selezionabile come responsabile ferie di altre persone)
        </label>
        <Field label="Responsabile">
          <Select value={managerId} onChange={(e) => setManagerId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Nessuno</option>
            {managerOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Colore">
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setColor(c)}
                className={`h-7 w-7 rounded-full ${color === c ? "ring-2 ring-offset-2 ring-brand-500" : ""}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
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
