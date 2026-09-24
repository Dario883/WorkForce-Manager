import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";
import Button from "../components/Button";
import { Field, Input } from "../components/ui";

export default function LoginPage() {
  const { login, verifyMfa, user } = useAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  if (user) {
    navigate("/");
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.mfaRequired) setChallengeToken(result.challengeToken);
      else navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Errore di accesso");
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!challengeToken) return;
    setError(null);
    setLoading(true);
    try {
      await verifyMfa(challengeToken, mfaCode);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Errore di verifica MFA");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center">
          <div className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-brand-500 text-lg font-bold text-white">
            WF
          </div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">WorkForce Manager</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Accedi al tuo account</p>
        </div>

        {challengeToken ? <form onSubmit={handleMfaSubmit}>
          <Field label="Codice MFA">
            <Input type="text" inputMode="numeric" pattern="[0-9]{6}" required value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} autoFocus />
          </Field>
          {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>{loading ? "Verifica in corso…" : "Verifica codice"}</Button>
        </form> : <form onSubmit={handleSubmit}>
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

          {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Accesso in corso…" : "Accedi"}
          </Button>
        </form>}
      </div>
    </div>
  );
}
