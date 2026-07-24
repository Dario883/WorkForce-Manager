import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { AppUser, Settings } from "@shared/types";
import { Card, CardBody, CardHeader } from "../components/Card";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { Badge, Field, Input } from "../components/ui";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [under, setUnder] = useState(70);
  const [over, setOver] = useState(100);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900 dark:text-slate-100">Impostazioni</h1>

      <Card className="mb-6 max-w-lg">
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

      <UsersSection />
    </div>
  );
}

function UsersSection() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

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

  return (
    <Card className="max-w-2xl">
      <CardHeader className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-800 dark:text-slate-100">Utenti</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Chi può accedere a WorkForce Manager.</p>
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
                    <td className="px-5 py-3 text-right">
                      <button
                        className={`${isSelf ? "cursor-not-allowed text-slate-300" : "text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400"}`}
                        disabled={isSelf}
                        title={isSelf ? "Non puoi disattivare il tuo stesso account" : undefined}
                        onClick={() => handleToggleActive(u)}
                      >
                        {u.active ? "Disattiva" : "Riattiva"}
                      </button>
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
    </Card>
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
