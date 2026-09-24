import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { db } from "../db";
import { users } from "../schema";
import { eq } from "drizzle-orm";
import {
  createMfaSetup,
  decryptMfaSecret,
  signMfaChallenge,
  verifyPassword,
  verifyMfaChallenge,
  verifyMfaCode,
  signSession,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
} from "../auth";
import { asyncHandler } from "../asyncHandler";
import { logAuthEvent } from "../authAudit";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const mfaCodeSchema = z.string().regex(/^\d{6}$/, "Il codice MFA deve contenere 6 cifre");

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit:
    process.env.NODE_ENV !== "production" && Number(process.env.LOGIN_RATE_LIMIT_MAX) > 0
      ? Number(process.env.LOGIN_RATE_LIMIT_MAX)
      : process.env.NODE_ENV === "test"
        ? 1000
        : 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Troppi tentativi di login. Riprova più tardi." },
});

authRouter.post("/login", loginRateLimit, asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Email o password non validi" });
  }
  const { email, password } = parsed.data;

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    await logAuthEvent(req, email, "login_failed", { reason: "unknown_email" });
    return res.status(401).json({ error: "Credenziali non valide" });
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    await logAuthEvent(req, email, "login_failed", { userId: user.id, reason: "wrong_password" });
    return res.status(401).json({ error: "Credenziali non valide" });
  }

  const payload = { userId: user.id, email: user.email, name: user.name };
  if (user.mfaEnabled && user.permissions === null) {
    await logAuthEvent(req, email, "login_success", { userId: user.id, reason: "mfa_required" });
    return res.json({ mfaRequired: true, challengeToken: signMfaChallenge(payload) });
  }

  const token = signSession(payload);
  setSessionCookie(res, token);
  await logAuthEvent(req, email, "login_success", { userId: user.id });
  res.json({ id: user.id, email: user.email, name: user.name, permissions: user.permissions ?? null });
}));

authRouter.post("/mfa/verify", loginRateLimit, asyncHandler(async (req, res) => {
  const parsed = z.object({ challengeToken: z.string().min(1), code: mfaCodeSchema }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Codice MFA non valido" });
  const challenge = verifyMfaChallenge(parsed.data.challengeToken);
  if (!challenge) return res.status(401).json({ error: "Sessione MFA scaduta" });

  const [user] = await db.select().from(users).where(eq(users.id, challenge.userId)).limit(1);
  const secret = user?.mfaEnabled && user.permissions === null && user.mfaSecretEncrypted
    ? decryptMfaSecret(user.mfaSecretEncrypted)
    : null;
  if (!user || !secret || !(await verifyMfaCode(secret, parsed.data.code))) {
    await logAuthEvent(req, challenge.email, "mfa_failed", { userId: challenge.userId, reason: "invalid_code" });
    return res.status(401).json({ error: "Codice MFA non valido" });
  }

  setSessionCookie(res, signSession({ userId: user.id, email: user.email, name: user.name }));
  await logAuthEvent(req, challenge.email, "login_success", { userId: challenge.userId, reason: "mfa_verified" });
  res.json({ id: user.id, email: user.email, name: user.name, permissions: user.permissions ?? null });
}));

authRouter.post("/mfa/setup", requireAuth, asyncHandler(async (req, res) => {
  if (req.user!.permissions !== null) return res.status(403).json({ error: "Solo gli amministratori possono configurare MFA" });
  const [user] = await db.select().from(users).where(eq(users.id, req.user!.userId)).limit(1);
  if (!user) return res.status(404).json({ error: "Utente non trovato" });
  const setup = createMfaSetup(user.email);
  await db.update(users).set({ mfaSecretEncrypted: setup.encryptedSecret, mfaEnabled: false }).where(eq(users.id, user.id));
  res.json({ secret: setup.secret, uri: setup.uri });
}));

authRouter.post("/mfa/confirm", requireAuth, asyncHandler(async (req, res) => {
  const parsed = mfaCodeSchema.safeParse(req.body.code);
  if (req.user!.permissions !== null || !parsed.success) return res.status(400).json({ error: "Codice MFA non valido" });
  const [user] = await db.select().from(users).where(eq(users.id, req.user!.userId)).limit(1);
  const secret = user?.mfaSecretEncrypted ? decryptMfaSecret(user.mfaSecretEncrypted) : null;
  if (!user || !secret || !(await verifyMfaCode(secret, parsed.data))) return res.status(400).json({ error: "Codice MFA non valido" });
  await db.update(users).set({ mfaEnabled: true }).where(eq(users.id, user.id));
  await logAuthEvent(req, user.email, "mfa_enabled", { userId: user.id });
  res.json({ ok: true });
}));

authRouter.post("/mfa/disable", requireAuth, asyncHandler(async (req, res) => {
  const parsed = z.object({ password: z.string().min(1), code: mfaCodeSchema.optional() }).safeParse(req.body);
  if (req.user!.permissions !== null || !parsed.success) return res.status(400).json({ error: "Dati MFA non validi" });
  const [user] = await db.select().from(users).where(eq(users.id, req.user!.userId)).limit(1);
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) return res.status(400).json({ error: "Password non valida" });
  if (user.mfaEnabled) {
    const secret = user.mfaSecretEncrypted ? decryptMfaSecret(user.mfaSecretEncrypted) : null;
    if (!secret || !parsed.data.code || !(await verifyMfaCode(secret, parsed.data.code))) {
      return res.status(400).json({ error: "Codice MFA non valido" });
    }
  }
  await db.update(users).set({ mfaSecretEncrypted: null, mfaEnabled: false }).where(eq(users.id, user.id));
  await logAuthEvent(req, user.email, "mfa_disabled", { userId: user.id });
  res.json({ ok: true });
}));

authRouter.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json(req.user);
});
