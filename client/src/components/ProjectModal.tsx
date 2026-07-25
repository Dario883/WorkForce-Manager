import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { DeliveryType, Person, Project, ProjectStatus } from "@shared/types";
import Button from "./Button";
import Modal from "./Modal";
import { Field, Input, Select } from "./ui";

// Stable reference, same reasoning as AssignmentModal's NO_PEOPLE.
const NO_PEOPLE: Person[] = [];

// Validated categorical palette (dataviz skill): passes lightness, chroma,
// CVD-separation, normal-vision-floor and contrast checks on both the app's
// light (#ffffff) and dark (#1e293b) card surfaces — unlike the previous
// hand-picked swatches, which failed the normal-vision floor between two
// adjacent colors (red/orange, ΔE 14.4 < 15).
const COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300"];

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  planned: "Pianificato",
  active: "Attivo",
  on_hold: "In pausa",
  completed: "Completato",
};

export const STATUS_COLOR: Record<ProjectStatus, string> = {
  planned: "#64748b",
  active: "#059669",
  on_hold: "#d97706",
  completed: "#3457d5",
};

export const DELIVERY_TYPES: DeliveryType[] = ["TK", "T&M", "TaaS", "AMS"];

export const DELIVERY_LABEL: Record<DeliveryType, string> = {
  TK: "Turnkey (chiavi in mano)",
  "T&M": "Time & Material",
  TaaS: "Team as a Service",
  AMS: "Application Management Services",
};

export const DELIVERY_COLOR: Record<DeliveryType, string> = {
  TK: "#0891b2",
  "T&M": "#3457d5",
  TaaS: "#7c3aed",
  AMS: "#d97706",
};

export default function ProjectModal({
  open,
  onClose,
  project,
  people = NO_PEOPLE,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  project: Project | null;
  people?: Person[];
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("planned");
  const [deliveryType, setDeliveryType] = useState<DeliveryType>("T&M");
  const [pmId, setPmId] = useState<number | "">("");
  const [color, setColor] = useState(COLORS[0]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (project) {
      setName(project.name);
      setClient(project.client ?? "");
      setStatus(project.status);
      setDeliveryType(project.deliveryType);
      setPmId(project.pmId ?? "");
      setColor(project.color);
      setStartDate(project.startDate ?? "");
      setEndDate(project.endDate ?? "");
    } else {
      setName("");
      setClient("");
      setStatus("planned");
      setDeliveryType("T&M");
      setPmId("");
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
      deliveryType,
      pmId: pmId === "" ? null : pmId,
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
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Errore durante il salvataggio del progetto.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={project ? "Modifica progetto" : "Nuovo progetto"}>
      <form onSubmit={handleSubmit}>
        {project && (
          <Field label="ID Commessa">
            <p className="rounded-md border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/40 px-3 py-2 font-mono text-xs text-slate-500 dark:text-slate-400">
              {project.commessaId}
            </p>
          </Field>
        )}
        <Field label="Nome progetto">
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Cliente">
          <Input value={client} onChange={(e) => setClient(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Stato">
            <Select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tipo di delivery">
            <Select value={deliveryType} onChange={(e) => setDeliveryType(e.target.value as DeliveryType)}>
              {DELIVERY_TYPES.map((value) => (
                <option key={value} value={value}>
                  {value} — {DELIVERY_LABEL[value]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="PM responsabile">
          <Select value={pmId} onChange={(e) => setPmId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Nessuno</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
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
