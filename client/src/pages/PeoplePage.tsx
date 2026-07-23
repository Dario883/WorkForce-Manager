import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { api } from "../lib/api";
import type { Person } from "@shared/types";
import { Card, CardBody } from "../components/Card";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { Field, Input } from "../components/ui";

const COLORS = ["#3457d5", "#059669", "#d97706", "#dc2626", "#7c3aed", "#0891b2"];

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Person | null>(null);
  const [search, setSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredPeople = people.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || (p.role ?? "").toLowerCase().includes(q);
  });

  function load() {
    setLoading(true);
    api
      .get<Person[]>("/people")
      .then(setPeople)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleDelete(id: number) {
    if (!confirm("Eliminare questa persona? L'azione non è reversibile.")) return;
    await api.delete(`/people/${id}`);
    load();
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const result = await api.post<{ imported: number }>("/people/import", { csv: text });
    alert(`Importate ${result.imported} persone.`);
    load();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleExport() {
    window.open("/api/people/export", "_blank");
  }

  function handleTemplate() {
    window.open("/api/people/csv-template", "_blank");
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Persone</h1>
          <p className="text-sm text-slate-500">{people.length} risorse totali</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleTemplate}>
            Template CSV
          </Button>
          <Button variant="secondary" onClick={handleExport}>
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
          >
            + Nuova persona
          </Button>
        </div>
      </div>

      <div className="mb-4">
        <Input
          type="text"
          placeholder="Cerca per nome o ruolo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardBody className="p-0">
          {loading ? (
            <p className="p-6 text-center text-sm text-slate-400">Caricamento…</p>
          ) : people.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400">Nessuna persona registrata</p>
          ) : filteredPeople.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400">Nessun risultato per la ricerca</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3">Nome</th>
                  <th className="px-5 py-3">Ruolo</th>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Capacità (h/sett.)</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPeople.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Link href={`/people/${p.id}`} className="flex items-center gap-2 font-medium text-slate-800 hover:text-brand-600">
                        <span
                          className="grid h-7 w-7 place-items-center rounded-full text-xs font-semibold text-white"
                          style={{ backgroundColor: p.avatarColor }}
                        >
                          {p.name.slice(0, 1).toUpperCase()}
                        </span>
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{p.role || "—"}</td>
                    <td className="px-5 py-3 text-slate-600">{p.email || "—"}</td>
                    <td className="px-5 py-3 text-slate-600">{p.capacityHoursPerWeek}h</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        className="mr-3 text-slate-500 hover:text-brand-600"
                        onClick={() => {
                          setEditing(p);
                          setModalOpen(true);
                        }}
                      >
                        Modifica
                      </button>
                      <button className="text-slate-500 hover:text-red-600" onClick={() => handleDelete(p.id)}>
                        Elimina
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <PersonModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        person={editing}
        onSaved={() => {
          setModalOpen(false);
          load();
        }}
      />
    </div>
  );
}

function PersonModal({
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
