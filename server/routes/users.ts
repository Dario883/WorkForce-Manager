import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { users } from "../schema";
import { eq } from "drizzle-orm";
import { asyncHandler } from "../asyncHandler";
import { hashPassword } from "../auth";

export const usersRouter = Router();

usersRouter.get("/", asyncHandler(async (_req, res) => {
  const rows = await db
    .select({ id: users.id, email: users.email, name: users.name, active: users.active, createdAt: users.createdAt })
    .from(users)
    .orderBy(users.name);
  res.json(rows);
}));

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
});

usersRouter.post("/", asyncHandler(async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const [existing] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
  if (existing) return res.status(409).json({ error: "Esiste già un utente con questa email" });

  const passwordHash = await hashPassword(parsed.data.password);
  const [created] = await db
    .insert(users)
    .values({ email: parsed.data.email, name: parsed.data.name, passwordHash })
    .returning({ id: users.id, email: users.email, name: users.name, active: users.active, createdAt: users.createdAt });
  res.status(201).json(created);
}));

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

usersRouter.put("/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  if (parsed.data.active === false && id === req.user!.userId) {
    return res.status(400).json({ error: "Non puoi disattivare il tuo stesso account" });
  }

  const { password, ...rest } = parsed.data;
  const values: Record<string, unknown> = { ...rest };
  if (password) values.passwordHash = await hashPassword(password);

  const [updated] = await db
    .update(users)
    .set(values)
    .where(eq(users.id, id))
    .returning({ id: users.id, email: users.email, name: users.name, active: users.active, createdAt: users.createdAt });
  if (!updated) return res.status(404).json({ error: "Utente non trovato" });
  res.json(updated);
}));
