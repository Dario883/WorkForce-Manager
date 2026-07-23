import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Settings } from "@shared/types";
import { Card, CardBody, CardHeader } from "../components/Card";
import Button from "../components/Button";
import { Field, Input } from "../components/ui";

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

  if (!settings) return <div className="text-slate-400">Caricamento…</div>;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Impostazioni</h1>

      <Card className="max-w-lg">
        <CardHeader>
          <h2 className="font-semibold text-slate-800">Soglie di allocazione</h2>
          <p className="text-xs text-slate-500">
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

            {saved && <p className="mb-3 text-sm text-emerald-600">Impostazioni salvate.</p>}

            <Button type="submit" disabled={saving}>
              {saving ? "Salvataggio…" : "Salva impostazioni"}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
