import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { api } from "../lib/api";
import type { DeliveryType, Person, Project, ProjectStatus } from "@shared/types";
import { Card, CardBody } from "../components/Card";
import Button from "../components/Button";
import { Badge, Input, Select, SortableTh } from "../components/ui";
import ProjectModal, { DELIVERY_COLOR, DELIVERY_LABEL, DELIVERY_TYPES, STATUS_COLOR, STATUS_LABEL } from "../components/ProjectModal";
import { compareValues, useSortable } from "../lib/sort";

const STATUS_FILTERS: (ProjectStatus | "all")[] = ["all", "planned", "active", "on_hold", "completed"];

type SortKey = "commessaId" | "name" | "client" | "status" | "deliveryType" | "pmName" | "startDate";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("all");
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryType | "all">("all");
  const [pmFilter, setPmFilter] = useState<number | "all">("all");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { sortKey, sortDir, onSort } = useSortable<SortKey>("name");

  const pmOptions = [...new Map(projects.filter((p) => p.pmId).map((p) => [p.pmId!, p.pmName!])).entries()].sort((a, b) =>
    a[1].localeCompare(b[1])
  );

  const filteredProjects = projects.filter((p) => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (deliveryFilter !== "all" && p.deliveryType !== deliveryFilter) return false;
    if (pmFilter !== "all" && p.pmId !== pmFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      (p.client ?? "").toLowerCase().includes(q) ||
      p.commessaId.toLowerCase().includes(q)
    );
  });

  const sortedProjects = [...filteredProjects].sort((a, b) => {
    const value = (p: Project): string => {
      switch (sortKey) {
        case "commessaId":
          return p.commessaId;
        case "client":
          return p.client ?? "";
        case "status":
          return STATUS_LABEL[p.status];
        case "deliveryType":
          return p.deliveryType;
        case "pmName":
          return p.pmName ?? "";
        case "startDate":
          return p.startDate ?? "";
        default:
          return p.name;
      }
    };
    return compareValues(value(a), value(b), sortDir);
  });

  function load() {
    setLoading(true);
    Promise.all([api.get<Project[]>("/projects"), api.get<Person[]>("/people")])
      .then(([pr, p]) => {
        setProjects(pr);
        setPeople(p);
      })
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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Progetti</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{projects.length} progetti totali</p>
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

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <Input
            type="text"
            placeholder="Cerca per nome o cliente…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-0.5">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                statusFilter === s ? "bg-brand-500 text-white" : "text-slate-600 dark:text-slate-300"
              }`}
            >
              {s === "all" ? "Tutti" : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <Select value={deliveryFilter} onChange={(e) => setDeliveryFilter(e.target.value as DeliveryType | "all")} className="sm:w-48">
          <option value="all">Tutti i tipi delivery</option>
          {DELIVERY_TYPES.map((d) => (
            <option key={d} value={d}>
              {d} — {DELIVERY_LABEL[d]}
            </option>
          ))}
        </Select>
        <Select value={pmFilter} onChange={(e) => setPmFilter(e.target.value === "all" ? "all" : Number(e.target.value))} className="sm:w-48">
          <option value="all">Tutti i PM</option>
          {pmOptions.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        <CardBody className="p-0">
          {loading ? (
            <p className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">Caricamento…</p>
          ) : projects.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">Nessun progetto registrato</p>
          ) : filteredProjects.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">Nessun risultato per i filtri selezionati</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 dark:border-slate-700 text-left text-xs uppercase text-slate-500 dark:text-slate-400">
                <tr>
                  <SortableTh label="ID Commessa" sortKey="commessaId" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                  <SortableTh label="Progetto" sortKey="name" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                  <SortableTh label="Cliente" sortKey="client" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                  <SortableTh label="Stato" sortKey="status" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                  <SortableTh label="Delivery" sortKey="deliveryType" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                  <SortableTh label="PM" sortKey="pmName" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                  <SortableTh label="Periodo" sortKey="startDate" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {sortedProjects.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-700">
                    <td className="px-5 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">{p.commessaId}</td>
                    <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-100">
                      <Link href={`/projects/${p.id}`} className="flex items-center hover:text-brand-600 dark:hover:text-brand-400">
                        <span
                          className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: p.color }}
                        />
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{p.client || "—"}</td>
                    <td className="px-5 py-3">
                      <Badge color={STATUS_COLOR[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      <Badge color={DELIVERY_COLOR[p.deliveryType]}>{p.deliveryType}</Badge>
                    </td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{p.pmName ?? "—"}</td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                      {p.startDate ?? "—"} → {p.endDate ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        className="mr-3 text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400"
                        onClick={() => {
                          setEditing(p);
                          setModalOpen(true);
                        }}
                      >
                        Modifica
                      </button>
                      <button className="text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400" onClick={() => handleDelete(p.id)}>
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
        people={people}
        onSaved={() => {
          setModalOpen(false);
          load();
        }}
      />
    </div>
  );
}
