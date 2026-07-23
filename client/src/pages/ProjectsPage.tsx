import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { Project, ProjectStatus } from "@shared/types";
import { Card, CardBody } from "../components/Card";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { Badge, Field, Input, Select } from "../components/ui";

const COLORS = ["#3457d5", "#059669", "#d97706", "#dc2626", "#7c3aed", "#0891b2"];

const STATUS_LABEL: Record<ProjectStatus, string> = {
  planned: "Pianificato",
  active: "Attivo",
  on_hold: "In pausa",
  completed: "Completato",
};

const STATUS_COLOR: Record<ProjectStatus, string> = {
  planned: "#64748b",
  active: "#059669",
  on_hold: "#d97706",
  completed: "#3457d5",
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function load() {
    setLoading(true);
    api
      .get<Project[]>("/projects")
      .then(setProjects)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleDelete(id: number) {
    if (!confirm("Eliminare questo progetto? Le assegnazioni collegate verranno rimosse.")) return;
    await api.delete(`/projects/${id}`);
    load();
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const result = await api.post<{ imported: number; skipped?: number }>("/projects/import", { csv: text });
    const skippedMsg = result.skipped ? ` (${result.skipped} righe saltate per dati non validi)` : "";
    alert(`Importati ${result.imported} progetti.${skippedMsg}`);
    load();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Progetti</h1>
          <p className="text-sm text-slate-500">{projects.length} progetti totali</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => window.open("/api/projects/csv-template", "_blank")}>
            Template CSV
          </Button>
          <Button variant="secondary" onClick={() => window.open("/api/projects/export", "_blank")}>
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
            + Nuovo progetto
          </Button>
        </div>
      </div>

      <Card>
        <CardBody className="p-0">
          {loading ? (
            <p className="p-6 text-center text-sm text-slate-400">Caricamento…</p>
          ) : projects.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400">Nessun progetto registrato</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3">Progetto</th>
                  <th className="px-5 py-3">Cliente</th>
                  <th className="px-5 py-3">Stato</th>
                  <th className="px-5 py-3">Periodo</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {projects.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-800">
                      <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                      {p.name}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{p.client || "—"}</td>
                    <td className="px-5 py-3">
                      <Badge color={STATUS_COLOR[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {p.startDate ?? "—"} → {p.endDate ?? "—"}
                    </td>
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

      <ProjectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        project={editing}
        onSaved={() => {
          setModalOpen(false);
          load();
        }}
      />
    </div>
  );
}

function ProjectModal({
  open,
  onClose,
  project,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  project: Project | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("planned");
  const [color, setColor] = useState(COLORS[0]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (project) {
      setName(project.name);
      setClient(project.client ?? "");
      setStatus(project.status);
      setColor(project.color);
      setStartDate(project.startDate ?? "");
      setEndDate(project.endDate ?? "");
    } else {
      setName("");
      setClient("");
      setStatus("planned");
      setColor(COLORS[Math.floor(Math.random() * COLORS.length)]);
      setStartDate("");
      setEndDate("");
    }
  }, [project, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      name,
      client: client || null,
      status,
      color,
      startDate: startDate || null,
      endDate: endDate || null,
    };
    try {
      if (project) {
        await api.put(`/projects/${project.id}`, payload);
      } else {
        await api.post("/projects", payload);
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={project ? "Modifica progetto" : "Nuovo progetto"}>
      <form onSubmit={handleSubmit}>
        <Field label="Nome progetto">
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Cliente">
          <Input value={client} onChange={(e) => setClient(e.target.value)} />
        </Field>
        <Field label="Stato">
          <Select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data inizio">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="Data fine">
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>
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
