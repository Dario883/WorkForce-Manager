import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { absences, people } from "../schema";
import { eq, asc } from "drizzle-orm";
import { asyncHandler } from "../asyncHandler";

export const absencesRouter = Router();

const ABSENCE_TYPES = ["ferie", "malattia", "permesso", "formazione", "altro"] as const;

const absenceSchema = z.object({
  personId: z.number().int().positive(),
  type: z.enum(ABSENCE_TYPES).default("ferie"),
  startDate: z.string(),
  endDate: z.string(),
  notes: z.string().optional().nullable(),
});

absencesRouter.get("/", asyncHandler(async (_req, res) => {
  const rows = await db
    .select({
      id: absences.id,
      personId: absences.personId,
      personName: people.name,
      type: absences.type,
      startDate: absences.startDate,
      endDate: absences.endDate,
      notes: absences.notes,
      createdAt: absences.createdAt,
      updatedAt: absences.updatedAt,
    })
    .from(absences)
    .innerJoin(people, eq(absences.personId, people.id))
    .orderBy(asc(absences.startDate));
  res.json(rows);
}));

absencesRouter.post("/", asyncHandler(async (req, res) => {
  const parsed = absenceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (parsed.data.endDate < parsed.data.startDate) {
    return res.status(400).json({ error: "La data di fine non può precedere la data di inizio" });
  }
  const [created] = await db.insert(absences).values(parsed.data).returning();
  res.status(201).json(created);
}));

absencesRouter.put("/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const parsed = absenceSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [updated] = await db
    .update(absences)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(absences.id, id))
    .returning();
  if (!updated) return res.status(404).json({ error: "Assenza non trovata" });
  res.json(updated);
}));

absencesRouter.delete("/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(absences).where(eq(absences.id, id));
  res.status(204).end();
}));
