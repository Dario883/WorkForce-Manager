import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { db } from "../db";
import { users } from "../schema";
import { eq } from "drizzle-orm";
import {
  verifyPassword,
  signSession,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
} from "../auth";
import { asyncHandler } from "../asyncHandler";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

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
    return res.status(401).json({ error: "Credenziali non valide" });
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Credenziali non valide" });
  }

  const token = signSession({ userId: user.id, email: user.email, name: user.name });
  setSessionCookie(res, token);
  res.json({ id: user.id, email: user.email, name: user.name, permissions: user.permissions ?? null });
}));

authRouter.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json(req.user);
});
