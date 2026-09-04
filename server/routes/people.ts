import { Router } from "express";
import { z } from "zod";
import Papa from "papaparse";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db";
import { people, assignments, projects, personCapacityPeriods } from "../schema";
import { eq, asc, desc, inArray } from "drizzle-orm";
import { asyncHandler } from "../asyncHandler";
import { logActivity } from "../activityLog";

export const peopleRouter = Router();

const PERSON_TYPES = ["consulente", "stage", "dipendente"] as const;

const personSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().nullable(),
  role: z.string().optional().nullable(),
  type: z.enum(PERSON_TYPES).default("dipendente"),
  avatarColor: z.string().default("#3457d5"),
  capacityHoursPerWeek: z.number().positive().default(40),
  managerId: z.number().int().positive().optional().nullable(),
  isApprover: z.boolean().default(false),
});

const managers = alias(people, "managers");

peopleRouter.get("/", asyncHandler(async (_req, res) => {
  const rows = await db
    .select({
      id: people.id,
      name: people.name,
      email: people.email,
      role: people.role,
      type: people.type,
      avatarColor: people.avatarColor,
      capacityHoursPerWeek: people.capacityHoursPerWeek,
      managerId: people.managerId,
      managerName: managers.name,
      isApprover: people.isApprover,
      createdAt: people.createdAt,
      updatedAt: people.updatedAt,
    })
    .from(people)
    .leftJoin(managers, eq(people.managerId, managers.id))
    .orderBy(asc(people.name));
  res.json(rows);
}));

peopleRouter.get("/csv-template", (_req, res) => {
  const csv = Papa.unparse({
    fields: ["name", "email", "role", "type", "capacityHoursPerWeek", "avatarColor"],
    data: [["Mario Rossi", "mario.rossi@example.com", "Developer", "dipendente", "40", "#3457d5"]],
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
      type: p.type,
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
  const errors: { row: number; reason: string }[] = [];
  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2; // +1 for header row, +1 for 1-based numbering
    const name = row.name?.trim();
    if (!name) {
      errors.push({ row: rowNumber, reason: "Nome mancante" });
      continue;
    }

    const typeRaw = row.type?.trim().toLowerCase();
    if (typeRaw && !(PERSON_TYPES as readonly string[]).includes(typeRaw)) {
      errors.push({ row: rowNumber, reason: `Tipo non valido: "${row.type}" (valori ammessi: ${PERSON_TYPES.join(", ")})` });
      continue;
    }

    const capacityRaw = row.capacityHoursPerWeek?.trim();
    const capacityHoursPerWeek = capacityRaw ? Number(capacityRaw) : 40;
    if (Number.isNaN(capacityHoursPerWeek) || capacityHoursPerWeek <= 0) {
      errors.push({ row: rowNumber, reason: `Capacità non valida: "${row.capacityHoursPerWeek}"` });
      continue;
    }

    const candidate = {
      name,
      email: row.email?.trim() || null,
      role: row.role?.trim() || null,
      type: (typeRaw || "dipendente") as (typeof PERSON_TYPES)[number],
      capacityHoursPerWeek,
      avatarColor: row.avatarColor?.trim() || "#3457d5",
    };

    try {
      await db.insert(people).values(candidate);
      imported++;
    } catch (err) {
      console.error("Errore import persona:", row, err);
      errors.push({ row: rowNumber, reason: "Errore durante il salvataggio" });
    }
  }
  res.json({ imported, skipped: errors.length, errors });
}));

peopleRouter.post("/bulk-delete", asyncHandler(async (req, res) => {
  const parsed = z.object({ ids: z.array(z.number().int().positive()).min(1).max(500) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Selezionare almeno una persona" });

  const uniqueIds = [...new Set(parsed.data.ids)];
  const existing = await db.select({ id: people.id, name: people.name }).from(people).where(inArray(people.id, uniqueIds));
  if (existing.length !== uniqueIds.length) {
    return res.status(404).json({ error: "Una o più persone non sono state trovate" });
  }

  await db.delete(people).where(inArray(people.id, uniqueIds));
  await Promise.all(existing.map((person) => logActivity(req.user!, "deleted", "persona", person.id, person.name, "Eliminazione multipla")));
  res.json({ deleted: existing.length });
}));

peopleRouter.get("/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const [person] = await db
    .select({
      id: people.id,
      name: people.name,
      email: people.email,
      role: people.role,
      avatarColor: people.avatarColor,
      capacityHoursPerWeek: people.capacityHoursPerWeek,
      managerId: people.managerId,
      managerName: managers.name,
      isApprover: people.isApprover,
      createdAt: people.createdAt,
      updatedAt: people.updatedAt,
    })
    .from(people)
    .leftJoin(managers, eq(people.managerId, managers.id))
    .where(eq(people.id, id))
    .limit(1);
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
  await logActivity(req.user!, "created", "persona", created.id, created.name);
  res.status(201).json(created);
}));

peopleRouter.put("/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const parsed = personSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (parsed.data.managerId === id) {
    return res.status(400).json({ error: "Una persona non può essere responsabile di se stessa" });
  }
  const [updated] = await db
    .update(people)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(people.id, id))
    .returning();
  if (!updated) return res.status(404).json({ error: "Persona non trovata" });
  await logActivity(req.user!, "updated", "persona", updated.id, updated.name);
  res.json(updated);
}));

peopleRouter.delete("/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(people).where(eq(people.id, id)).limit(1);
  await db.delete(people).where(eq(people.id, id));
  if (existing) await logActivity(req.user!, "deleted", "persona", id, existing.name);
  res.status(204).end();
}));
