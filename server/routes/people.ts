import { Router } from "express";
import { z } from "zod";
import Papa from "papaparse";
import { db } from "../db";
import { people, assignments, projects, personCapacityPeriods } from "../schema";
import { eq, asc, desc } from "drizzle-orm";
import { asyncHandler } from "../asyncHandler";

export const peopleRouter = Router();

const personSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().nullable(),
  role: z.string().optional().nullable(),
  avatarColor: z.string().default("#3457d5"),
  capacityHoursPerWeek: z.number().positive().default(40),
});

peopleRouter.get("/", asyncHandler(async (_req, res) => {
  const rows = await db.select().from(people).orderBy(asc(people.name));
  res.json(rows);
}));

peopleRouter.get("/csv-template", (_req, res) => {
  const csv = Papa.unparse({
    fields: ["name", "email", "role", "capacityHoursPerWeek", "avatarColor"],
    data: [["Mario Rossi", "mario.rossi@example.com", "Developer", "40", "#3457d5"]],
  });
  res.header("Content-Type", "text/csv");
  res.attachment("people-template.csv");
  res.send(csv);
});

peopleRouter.get("/export", asyncHandler(async (_req, res) => {
  const rows = await db.select().from(people).orderBy(asc(people.name));
  const csv = Papa.unparse(
    rows.map((p) => ({
      name: p.name,
      email: p.email ?? "",
      role: p.role ?? "",
      capacityHoursPerWeek: p.capacityHoursPerWeek,
      avatarColor: p.avatarColor,
    }))
  );
  res.header("Content-Type", "text/csv");
  res.attachment("people-export.csv");
  res.send(csv);
}));

peopleRouter.post("/import", asyncHandler(async (req, res) => {
  const bodySchema = z.object({ csv: z.string() });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "CSV mancante" });

  const result = Papa.parse(parsed.data.csv, { header: true, skipEmptyLines: true });
  const rows = result.data as Record<string, string>[];

  let imported = 0;
  for (const row of rows) {
    const candidate = {
      name: row.name?.trim(),
      email: row.email?.trim() || null,
      role: row.role?.trim() || null,
      capacityHoursPerWeek: row.capacityHoursPerWeek ? Number(row.capacityHoursPerWeek) : 40,
      avatarColor: row.avatarColor?.trim() || "#3457d5",
    };
    if (!candidate.name) continue;
    await db.insert(people).values(candidate);
    imported++;
  }
  res.json({ imported });
}));

peopleRouter.get("/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const [person] = await db.select().from(people).where(eq(people.id, id)).limit(1);
  if (!person) return res.status(404).json({ error: "Persona non trovata" });
  res.json(person);
}));

peopleRouter.get("/:id/assignments", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const rows = await db
    .select({
      id: assignments.id,
      percentage: assignments.percentage,
      startDate: assignments.startDate,
      endDate: assignments.endDate,
      periodType: assignments.periodType,
      projectId: assignments.projectId,
      projectName: projects.name,
      projectColor: projects.color,
    })
    .from(assignments)
    .innerJoin(projects, eq(assignments.projectId, projects.id))
    .where(eq(assignments.personId, id));
  res.json(rows);
}));

const capacityPeriodSchema = z.object({
  startDate: z.string(),
  endDate: z.string().optional().nullable(),
  hoursPerWeek: z.number().positive(),
});

peopleRouter.get("/:id/capacity", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const rows = await db
    .select()
    .from(personCapacityPeriods)
    .where(eq(personCapacityPeriods.personId, id))
    .orderBy(desc(personCapacityPeriods.startDate));
  res.json(rows);
}));

peopleRouter.post("/:id/capacity", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const parsed = capacityPeriodSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (parsed.data.endDate && parsed.data.endDate < parsed.data.startDate) {
    return res.status(400).json({ error: "La data di fine non può precedere la data di inizio" });
  }
  const [created] = await db
    .insert(personCapacityPeriods)
    .values({ ...parsed.data, personId: id })
    .returning();
  res.status(201).json(created);
}));

peopleRouter.delete("/:id/capacity/:capacityId", asyncHandler(async (req, res) => {
  const capacityId = Number(req.params.capacityId);
  await db.delete(personCapacityPeriods).where(eq(personCapacityPeriods.id, capacityId));
  res.status(204).end();
}));

peopleRouter.post("/", asyncHandler(async (req, res) => {
  const parsed = personSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [created] = await db.insert(people).values(parsed.data).returning();
  res.status(201).json(created);
}));

peopleRouter.put("/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const parsed = personSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [updated] = await db
    .update(people)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(people.id, id))
    .returning();
  if (!updated) return res.status(404).json({ error: "Persona non trovata" });
  res.json(updated);
}));

peopleRouter.delete("/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(people).where(eq(people.id, id));
  res.status(204).end();
}));
