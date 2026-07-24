import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { holidays } from "../schema";
import { eq, asc } from "drizzle-orm";
import { asyncHandler } from "../asyncHandler";

export const holidaysRouter = Router();

const holidaySchema = z.object({
  date: z.string(),
  name: z.string().min(1),
});

holidaysRouter.get("/", asyncHandler(async (_req, res) => {
  const rows = await db.select().from(holidays).orderBy(asc(holidays.date));
  res.json(rows);
}));

holidaysRouter.post("/", asyncHandler(async (req, res) => {
  const parsed = holidaySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [existing] = await db.select().from(holidays).where(eq(holidays.date, parsed.data.date)).limit(1);
  if (existing) return res.status(409).json({ error: "Esiste già una festività in questa data" });
  const [created] = await db.insert(holidays).values(parsed.data).returning();
  res.status(201).json(created);
}));

holidaysRouter.delete("/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(holidays).where(eq(holidays.id, id));
  res.status(204).end();
}));
