import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Person } from "@shared/types";
import Button from "./Button";
import Modal from "./Modal";
import { Field, Input } from "./ui";

const COLORS = ["#3457d5", "#059669", "#d97706", "#dc2626", "#7c3aed", "#0891b2"];

export default function PersonModal({
  open,
  onClose,
  person,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  person: Person | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [capacity, setCapacity] = useState(40);
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (person) {
      setName(person.name);
      setEmail(person.email ?? "");
      setRole(person.role ?? "");
      setCapacity(person.capacityHoursPerWeek);
      setColor(person.avatarColor);
    } else {
      setName("");
      setEmail("");
      setRole("");
      setCapacity(40);
      setColor(COLORS[Math.floor(Math.random() * COLORS.length)]);
    }
  }, [person, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      name,
      email: email || null,
      role: role || null,
      capacityHoursPerWeek: capacity,
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
