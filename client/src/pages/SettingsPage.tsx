import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { ActivityLogEntry, AppUser, Holiday, Settings } from "@shared/types";
import { APP_TABS } from "@shared/types";
import { Card, CardBody, CardHeader } from "../components/Card";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { Badge, Field, Input, Select, SortableTh } from "../components/ui";
import { compareValues, useSortable } from "../lib/sort";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [under, setUnder] = useState(70);
  const [over, setOver] = useState(100);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<"thresholds" | "holidays" | "users" | "activity">("thresholds");

  useEffect(() => {
    api.get<Settings>("/settings").then((s) => {
      setSettings(s);
      setUnder(Number(s.underutilization_threshold));
      setOver(Number(s.overutilization_threshold));
    });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await api.put("/settings", {
        underutilization_threshold: String(under),
        overutilization_threshold: String(over),
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return <div className="text-slate-400 dark:text-slate-500">Caricamento…</div>;

  const TABS = [
    { key: "thresholds", label: "Soglie" },
    { key: "holidays", label: "Festività" },
    { key: "users", label: "Utenti" },
    { key: "activity", label: "Registro attività" },
  ] as const;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900 dark:text-slate-100">Impostazioni</h1>

      <div className="flex flex-col gap-6 sm:flex-row">
        <nav className="flex shrink-0 flex-row gap-1 sm:w-48 sm:flex-col">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`rounded-lg px-3 py-2 text-left text-sm font-medium ${
                activeTab === t.key
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1">
          {activeTab === "thresholds" && (
            <Card className="max-w-lg">
              <CardHeader>
                <h2 className="font-semibold text-slate-800 dark:text-slate-100">Soglie di allocazione</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Usate nella Dashboard per segnalare persone sotto o sovra allocate.
                </p>
              </CardHeader>
              <CardBody>
                <form onSubmit={handleSave}>
                  <Field label="Soglia sotto-utilizzo (%)">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={under}
                      onChange={(e) => setUnder(Number(e.target.value))}
                    />
                  </Field>
                  <Field label="Soglia sovra-utilizzo (%)">
                    <Input
                      type="number"
                      min={100}
                      max={300}
                      value={over}
                      onChange={(e) => setOver(Number(e.target.value))}
                    />
                  </Field>

                  {saved && <p className="mb-3 text-sm text-emerald-600 dark:text-emerald-400">Impostazioni salvate.</p>}

                  <Button type="submit" disabled={saving}>
                    {saving ? "Salvataggio…" : "Salva impostazioni"}
                  </Button>
                </form>
              </CardBody>
            </Card>
          )}

          {activeTab === "holidays" && <HolidaysSection />}
          {activeTab === "users" && <UsersSection />}
          {activeTab === "activity" && <ActivityLogSection />}
        </div>
      </div>
    </div>
  );
}

const ACTION_LABEL: Record<string, string> = {
  created: "Creato",
  updated: "Modificato",
  deleted: "Eliminato",
};

const ACTION_COLOR: Record<string, string> = {
  created: "#059669",
  updated: "#0891b2",
  deleted: "#dc2626",
};

type ActivitySortKey = "createdAt" | "userName" | "action" | "entityType" | "entityName";
const PAGE_SIZE = 25;

function ActivityLogSection() {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [userFilter, setUserFilter] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const { sortKey, sortDir, onSort } = useSortable<ActivitySortKey>("createdAt", "desc");

  useEffect(() => {
    api
      .get<ActivityLogEntry[]>("/activity")
      .then(setEntries)
      .finally(() => setLoading(false));
  }, []);

  const userOptions = [...new Set(entries.map((e) => e.userName))].sort();
  const entityTypeOptions = [...new Set(entries.map((e) => e.entityType))].sort();

  const filtered = entries.filter((e) => {
    if (userFilter && e.userName !== userFilter) return false;
    if (entityTypeFilter && e.entityType !== entityTypeFilter) return false;
    const day = e.createdAt.slice(0, 10);
    if (fromDate && day < fromDate) return false;
    if (toDate && day > toDate) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const value = (e: ActivityLogEntry): string => {
      switch (sortKey) {
        case "userName":
          return e.userName;
        case "action":
          return e.action;
        case "entityType":
          return e.entityType;
        case "entityName":
          return e.entityName;
        default:
          return e.createdAt;
      }
    };
    return compareValues(value(a), value(b), sortDir);
  });

  const visible = sorted.slice(0, visibleCount);

  return (
    <Card className="max-w-4xl">
      <CardHeader>
        <h2 className="font-semibold text-slate-800 dark:text-slate-100">Registro attività</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Chi ha creato, modificato o eliminato cosa ({filtered.length} di {entries.length} voci)
        </p>
      </CardHeader>
      <CardBody className="grid grid-cols-1 gap-3 border-b border-slate-100 dark:border-slate-700 sm:grid-cols-4">
        <Select
          value={userFilter}
          onChange={(e) => {
            setUserFilter(e.target.value);
            setVisibleCount(PAGE_SIZE);
          }}
        >
          <option value="">Tutti gli utenti</option>
          {userOptions.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </Select>
        <Select
          value={entityTypeFilter}
          onChange={(e) => {
            setEntityTypeFilter(e.target.value);
            setVisibleCount(PAGE_SIZE);
          }}
        >
          <option value="">Tutti i tipi</option>
          {entityTypeOptions.map((t) => (
            <option key={t} value={t} className="capitalize">
              {t}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          value={fromDate}
          onChange={(e) => {
            setFromDate(e.target.value);
            setVisibleCount(PAGE_SIZE);
          }}
          title="Da data"
        />
        <Input
          type="date"
          value={toDate}
          onChange={(e) => {
            setToDate(e.target.value);
            setVisibleCount(PAGE_SIZE);
          }}
          title="A data"
        />
      </CardBody>
      <CardBody className="p-0">
        {loading ? (
          <p className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">Caricamento…</p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">Nessuna attività registrata</p>
        ) : (
          <div className="max-h-[28rem] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 border-b border-slate-100 bg-white dark:border-slate-700 dark:bg-slate-800 text-left text-xs uppercase text-slate-500 dark:text-slate-400">
                <tr>
                  <SortableTh label="Quando" sortKey="createdAt" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                  <SortableTh label="Chi" sortKey="userName" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                  <SortableTh label="Azione" sortKey="action" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                  <SortableTh label="Tipo" sortKey="entityType" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                  <SortableTh label="Nome" sortKey="entityName" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {visible.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-700">
                    <td className="whitespace-nowrap px-5 py-3 text-xs text-slate-500 dark:text-slate-400">
                      {e.createdAt.replace("T", " ").slice(0, 16)}
                    </td>
                    <td className="px-5 py-3 text-slate-700 dark:text-slate-200">{e.userName}</td>
                    <td className="px-5 py-3">
                      <Badge color={ACTION_COLOR[e.action] ?? "#64748b"}>{ACTION_LABEL[e.action] ?? e.action}</Badge>
                    </td>
                    <td className="px-5 py-3 capitalize text-slate-600 dark:text-slate-300">{e.entityType}</td>
                    <td className="px-5 py-3 text-slate-800 dark:text-slate-100">{e.entityName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
      {filtered.length > visible.length && (
        <div className="border-t border-slate-100 px-5 py-3 text-center dark:border-slate-700">
          <button
            className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline"
            onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
          >
            Mostra altre ({filtered.length - visible.length} rimanenti)
          </button>
        </div>
      )}
    </Card>
  );
}

function HolidaysSection() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    api
      .get<Holiday[]>("/holidays")
      .then(setHolidays)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/holidays", { date, name });
      setDate("");
      setName("");
      load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Errore durante il salvataggio della festività.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Rimuovere questa festività?")) return;
    await api.delete(`/holidays/${id}`);
    load();
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <h2 className="font-semibold text-slate-800 dark:text-slate-100">Festività aziendali</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Mostrate a tutti nel Calendario, distinte dalle assenze personali.
        </p>
      </CardHeader>
      <CardBody className="border-b border-slate-100 dark:border-slate-700">
        <form onSubmit={handleAdd} className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
          <Field label="Data">
            <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Nome">
            <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="es. Ferragosto" />
          </Field>
          <Button type="submit" disabled={saving}>
            {saving ? "Salvataggio…" : "+ Aggiungi"}
          </Button>
        </form>
      </CardBody>
      <CardBody className="p-0">
        {loading ? (
          <p className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">Caricamento…</p>
        ) : holidays.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">Nessuna festività registrata</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 dark:border-slate-700 text-left text-xs uppercase text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-5 py-3">Data</th>
                <th className="px-5 py-3">Nome</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {holidays.map((h) => (
                <tr key={h.id} className="hover:bg-slate-50 dark:hover:bg-slate-700">
                  <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{h.date}</td>
                  <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-100">{h.name}</td>
                  <td className="px-5 py-3 text-right">
                    <button
                      className="text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                      onClick={() => handleDelete(h.id)}
                    >
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
  );
}

function UsersSection() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);

  function load() {
    setLoading(true);
    api
      .get<AppUser[]>("/users")
      .then(setUsers)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleToggleActive(u: AppUser) {
    if (!confirm(u.active ? `Disattivare l'accesso di ${u.name}?` : `Riattivare l'accesso di ${u.name}?`)) return;
    try {
      await api.put(`/users/${u.id}`, { active: !u.active });
      load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Errore durante l'operazione.");
    }
  }

  async function handleDelete(u: AppUser) {
    if (!confirm(`Eliminare definitivamente l'utente ${u.name}? L'operazione non è reversibile.`)) return;
    try {
      await api.delete(`/users/${u.id}`);
      load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Errore durante l'eliminazione dell'utente.");
    }
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-800 dark:text-slate-100">Utenti</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Chi può accedere a WorkForce Manager e a quali sezioni.</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>+ Nuovo utente</Button>
      </CardHeader>
      <CardBody className="p-0">
        {loading ? (
          <p className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">Caricamento…</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 dark:border-slate-700 text-left text-xs uppercase text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-5 py-3">Nome</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Stato</th>
                <th className="px-5 py-3">Permessi</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {users.map((u) => {
                const isSelf = currentUser?.userId === u.id;
                return (
                  <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-700">
                    <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-100">
                      {u.name}
                      {isSelf && <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">(tu)</span>}
                    </td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{u.email}</td>
                    <td className="px-5 py-3">
                      <Badge color={u.active ? "#059669" : "#64748b"}>{u.active ? "Attivo" : "Disattivato"}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      <Badge color={u.permissions ? "#c98500" : "#3987e5"}>
                        {u.permissions ? `${u.permissions.length}/${APP_TABS.length} sezioni` : "Tutte le sezioni"}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-3">
                        <button
                          className="text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400"
                          onClick={() => setEditing(u)}
                        >
                          Modifica
                        </button>
                        <button
                          className={`${isSelf ? "cursor-not-allowed text-slate-300 dark:text-slate-600" : "text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400"}`}
                          disabled={isSelf}
                          title={isSelf ? "Non puoi disattivare il tuo stesso account" : undefined}
                          onClick={() => handleToggleActive(u)}
                        >
                          {u.active ? "Disattiva" : "Riattiva"}
                        </button>
                        <button
                          className={`${isSelf ? "cursor-not-allowed text-slate-300 dark:text-slate-600" : "text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400"}`}
                          disabled={isSelf}
                          title={isSelf ? "Non puoi eliminare il tuo stesso account" : undefined}
                          onClick={() => handleDelete(u)}
                        >
                          Elimina
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardBody>

      <NewUserModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false);
          load();
        }}
      />

      <EditUserModal
        user={editing}
        isSelf={editing !== null && currentUser?.userId === editing.id}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    </Card>
  );
}

function EditUserModal({
  user,
  isSelf,
  onClose,
  onSaved,
}: {
  user: AppUser | null;
  isSelf: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [permissions, setPermissions] = useState<string[] | null>(null);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setPermissions(user.permissions);
      setPassword("");
    }
  }, [user]);

  if (!user) return null;

  const allTabs = APP_TABS.map((t) => t.key);
  const hasFullAccess = permissions === null;

  function toggleTab(key: string) {
    setPermissions((prev) => {
      const current = prev ?? allTabs;
      const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, unknown> = { name, permissions };
      if (password) body.password = password;
      await api.put(`/users/${user!.id}`, body);
      onSaved();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Errore durante il salvataggio dell'utente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={!!user} onClose={onClose} title={`Modifica utente — ${user.email}`}>
      <form onSubmit={handleSubmit}>
        <Field label="Nome">
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Nuova password (lascia vuoto per non modificarla)">
          <Input type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Sezioni accessibili</span>
            <button
              type="button"
              className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
              onClick={() => setPermissions(hasFullAccess ? [] : null)}
            >
              {hasFullAccess ? "Personalizza" : "Concedi tutte"}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-600">
            {APP_TABS.map((t) => {
              const checked = hasFullAccess || (permissions?.includes(t.key) ?? false);
              const isSettingsLockedForSelf = isSelf && t.key === "settings";
              return (
                <label
                  key={t.key}
                  className={`flex items-center gap-2 text-sm ${
                    isSettingsLockedForSelf ? "text-slate-400 dark:text-slate-500" : "text-slate-700 dark:text-slate-200"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={hasFullAccess || isSettingsLockedForSelf}
                    onChange={() => toggleTab(t.key)}
                  />
                  {t.label}
                </label>
              );
            })}
          </div>
          {isSelf && (
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Non puoi rimuovere il tuo stesso accesso a Impostazioni.
            </p>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Salvataggio…" : "Salva modifiche"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function NewUserModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setEmail("");
      setName("");
      setPassword("");
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/users", { email, name, password });
      onSaved();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Errore durante la creazione dell'utente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nuovo utente">
      <form onSubmit={handleSubmit}>
        <Field label="Nome">
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email">
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password iniziale">
          <Input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Creazione…" : "Crea utente"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
