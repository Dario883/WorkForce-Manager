import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { assignments, people, projects } from "../schema";
import { eq } from "drizzle-orm";
import { eachDayOfInterval, format } from "date-fns";
import { asyncHandler } from "../asyncHandler";

export const staffingRouter = Router();

const querySchema = z.object({
  from: z.string(),
  to: z.string(),
});

/**
 * Returns, for every person, the summed allocation percentage per day in
 * the requested range plus the list of contributing project assignments.
 * The frontend uses this to render weekly/monthly/yearly calendars and
 * the dashboard KPIs (under/over allocation).
 */
staffingRouter.get("/snapshot", asyncHandler(async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "from/to richiesti (YYYY-MM-DD)" });

  const from = new Date(parsed.data.from);
  const to = new Date(parsed.data.to);

  const allPeople = await db.select().from(people);
  const allAssignments = await db
    .select({
      id: assignments.id,
      personId: assignments.personId,
      projectId: assignments.projectId,
      projectName: projects.name,
      projectColor: projects.color,
      percentage: assignments.percentage,
      startDate: assignments.startDate,
      endDate: assignments.endDate,
    })
    .from(assignments)
    .innerJoin(projects, eq(assignments.projectId, projects.id));

  // Build day-by-day allocation map per person
  const days = eachDayOfInterval({ start: from, end: to }).map((d) => format(d, "yyyy-MM-dd"));

  const byPerson = allPeople.map((person) => {
    const personAssignments = allAssignments.filter((a) => a.personId === person.id);
    const dayMap: Record<
      string,
      { total: number; items: { projectName: string; projectColor: string; percentage: number }[] }
    > = {};

    for (const day of days) {
      const dayDate = new Date(day);
      const active = personAssignments.filter((a) => {
        const s = new Date(a.startDate);
        const e = new Date(a.endDate);
        return dayDate >= s && dayDate <= e;
      });
      dayMap[day] = {
        total: active.reduce((sum, a) => sum + a.percentage, 0),
        items: active.map((a) => ({
          projectName: a.projectName,
          projectColor: a.projectColor,
          percentage: a.percentage,
        })),
      };
    }

    return {
      personId: person.id,
      personName: person.name,
      capacityHoursPerWeek: person.capacityHoursPerWeek,
      avatarColor: person.avatarColor,
      days: dayMap,
    };
  });

  res.json({ from: format(from, "yyyy-MM-dd"), to: format(to, "yyyy-MM-dd"), people: byPerson });
}));
