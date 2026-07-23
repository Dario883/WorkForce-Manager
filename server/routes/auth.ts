import { Router } from "express";
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

authRouter.post("/login", asyncHandler(async (req, res) => {
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
  res.json({ id: user.id, email: user.email, name: user.name });
}));

authRouter.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json(req.user);
});
