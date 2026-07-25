import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { users } from "../schema";
import { eq } from "drizzle-orm";
import { asyncHandler } from "../asyncHandler";
import { hashPassword } from "../auth";
import { logActivity } from "../activityLog";
import { ALL_PERMISSION_KEYS } from "@shared/types";

export const usersRouter = Router();

const USER_COLUMNS = {
  id: users.id,
  email: users.email,
  name: users.name,
  active: users.active,
  permissions: users.permissions,
  createdAt: users.createdAt,
};

const TAB_KEYS = ALL_PERMISSION_KEYS.map((t) => t.key) as [string, ...string[]];

usersRouter.get("/", asyncHandler(async (_req, res) => {
  const rows = await db.select(USER_COLUMNS).from(users).orderBy(users.name);
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
    .returning(USER_COLUMNS);
  await logActivity(req.user!, "created", "utente", created.id, created.name);
  res.status(201).json(created);
}));

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional(),
  permissions: z.array(z.enum(TAB_KEYS)).nullable().optional(),
});

usersRouter.put("/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const isSelf = id === req.user!.userId;
  if (parsed.data.active === false && isSelf) {
    return res.status(400).json({ error: "Non puoi disattivare il tuo stesso account" });
  }
  if (
    isSelf &&
    parsed.data.permissions &&
    (!parsed.data.permissions.includes("settings") || !parsed.data.permissions.includes("settings:users"))
  ) {
    return res.status(400).json({ error: "Non puoi rimuovere il tuo stesso accesso a Impostazioni > Utenti" });
  }

  const { password, ...rest } = parsed.data;
  const values: Record<string, unknown> = { ...rest };
  if (password) values.passwordHash = await hashPassword(password);

  const [updated] = await db.update(users).set(values).where(eq(users.id, id)).returning(USER_COLUMNS);
  if (!updated) return res.status(404).json({ error: "Utente non trovato" });
  await logActivity(req.user!, "updated", "utente", updated.id, updated.name);
  res.json(updated);
}));

usersRouter.delete("/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user!.userId) {
    return res.status(400).json({ error: "Non puoi eliminare il tuo stesso account" });
  }

  const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!existing) return res.status(404).json({ error: "Utente non trovato" });

  await db.delete(users).where(eq(users.id, id));
  await logActivity(req.user!, "deleted", "utente", id, existing.name);
  res.status(204).end();
}));
