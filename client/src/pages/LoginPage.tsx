import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";
import Button from "../components/Button";
import { Field, Input } from "../components/ui";

export default function LoginPage() {
  const { login, user } = useAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user) {
    navigate("/");
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Errore di accesso");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center">
          <div className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-brand-500 text-lg font-bold text-white">
            WF
          </div>
          <h1 className="text-lg font-semibold text-slate-900">WorkForce Manager</h1>
          <p className="text-sm text-slate-500">Accedi al tuo account</p>
        </div>

        <form onSubmit={handleSubmit}>
          <Field label="Email">
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome@azienda.com"
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </Field>

          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Accesso in corso…" : "Accedi"}
          </Button>
        </form>
      </div>
    </div>
  );
}
