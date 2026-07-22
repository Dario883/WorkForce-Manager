import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  createAssignment,
  createPerson,
  createProject,
  deleteAssignment,
  deletePerson,
  deleteProject,
  getAllAssignments,
  getAllPeople,
  getAllProjects,
  getAllSettings,
  getAssignmentsByPerson,
  getAssignmentsByProject,
  getAssignmentsInRange,
  getPersonById,
  getProjectById,
  getSetting,
  getStaffingSnapshot,
  setSetting,
  splitAssignmentByPeriod,
  updateAssignment,
  updatePerson,
  updateProject,
} from "./db";

// ── Shared Zod schemas ────────────────────────────────────────────────────────

const personSchema = z.object({
  name: z.string().min(1).max(128),
  role: z.string().min(1).max(128),
  email: z.string().email().optional().nullable(),
  weeklyCapacityHours: z.number().min(1).max(168).default(40),
  avatarColor: z.string().optional().nullable(),
});

const projectSchema = z.object({
  name: z.string().min(1).max(256),
  description: z.string().optional().nullable(),
  status: z.enum(["planning", "active", "on_hold", "completed", "cancelled"]).default("planning"),
  color: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
});

const assignmentSchema = z.object({
  personId: z.number().int().positive(),
  projectId: z.number().int().positive(),
  allocationPercent: z.number().min(1).max(200),
  startDate: z.string(),
  endDate: z.string(),
  notes: z.string().optional().nullable(),
});

// ── App Router ────────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ── People ────────────────────────────────────────────────────────────────

  people: router({
    list: publicProcedure.query(async () => {
      return getAllPeople();
    }),

    byId: publicProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ input }) => {
        return getPersonById(input.id);
      }),

    create: protectedProcedure
      .input(personSchema)
      .mutation(async ({ input }) => {
        await createPerson({
          name: input.name,
          role: input.role,
          email: input.email ?? null,
          weeklyCapacityHours: String(input.weeklyCapacityHours),
          avatarColor: input.avatarColor ?? "#6366f1",
        });
        return { success: true };
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }).merge(personSchema.partial()))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updatePerson(id, {
          ...data,
          weeklyCapacityHours: data.weeklyCapacityHours !== undefined ? String(data.weeklyCapacityHours) : undefined,
        });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        await deletePerson(input.id);
        return { success: true };
      }),

    assignments: publicProcedure
      .input(z.object({ personId: z.number().int().positive() }))
      .query(async ({ input }) => {
        return getAssignmentsByPerson(input.personId);
      }),
  }),

  // ── Projects ──────────────────────────────────────────────────────────────

  projects: router({
    list: publicProcedure.query(async () => {
      return getAllProjects();
    }),

    byId: publicProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ input }) => {
        return getProjectById(input.id);
      }),

    create: protectedProcedure
      .input(projectSchema)
      .mutation(async ({ input }) => {
        await createProject({
          name: input.name,
          description: input.description ?? null,
          status: input.status,
          color: input.color ?? "#6366f1",
          startDate: input.startDate ? new Date(input.startDate) : null,
          endDate: input.endDate ? new Date(input.endDate) : null,
        });
        return { success: true };
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }).merge(projectSchema.partial()))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateProject(id, {
          ...data,
          startDate: data.startDate !== undefined ? (data.startDate ? new Date(data.startDate) : null) : undefined,
          endDate: data.endDate !== undefined ? (data.endDate ? new Date(data.endDate) : null) : undefined,
        });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        await deleteProject(input.id);
        return { success: true };
      }),

    assignments: publicProcedure
      .input(z.object({ projectId: z.number().int().positive() }))
      .query(async ({ input }) => {
        return getAssignmentsByProject(input.projectId);
      }),
  }),

  // ── Assignments ───────────────────────────────────────────────────────────

  assignments: router({
    list: publicProcedure.query(async () => {
      return getAllAssignments();
    }),

    inRange: publicProcedure
      .input(z.object({ startDate: z.string(), endDate: z.string() }))
      .query(async ({ input }) => {
        return getAssignmentsInRange(input.startDate, input.endDate);
      }),

    create: protectedProcedure
      .input(assignmentSchema)
      .mutation(async ({ input }) => {
        await createAssignment({
          personId: input.personId,
          projectId: input.projectId,
          allocationPercent: String(input.allocationPercent),
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          notes: input.notes ?? null,
        });
        return { success: true };
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }).merge(assignmentSchema.partial()))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateAssignment(id, {
          ...data,
          allocationPercent: data.allocationPercent !== undefined ? String(data.allocationPercent) : undefined,
          startDate: data.startDate ? new Date(data.startDate) : undefined,
          endDate: data.endDate ? new Date(data.endDate) : undefined,
        });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        await deleteAssignment(input.id);
        return { success: true };
      }),

    splitByPeriod: protectedProcedure
      .input(z.object({
        id: z.number().int().positive(),
        newPercent: z.number().min(1).max(200),
        periodType: z.enum(["daily", "weekly", "monthly", "yearly"]),
        periodDate: z.string(),
      }))
      .mutation(async ({ input }) => {
        await splitAssignmentByPeriod(
          input.id,
          input.newPercent,
          input.periodType,
          new Date(input.periodDate)
        );
        return { success: true };
      }),
  }),

  // ── Staffing ──────────────────────────────────────────────────────────────

  staffing: router({
    snapshot: publicProcedure
      .input(z.object({ startDate: z.string(), endDate: z.string() }))
      .query(async ({ input }) => {
        const [allPeople, allProjects, snapshot] = await Promise.all([
          getAllPeople(),
          getAllProjects(),
          getStaffingSnapshot(input.startDate, input.endDate),
        ]);
        return { people: allPeople, projects: allProjects, assignments: snapshot };
      }),
  }),

  // ── Settings ──────────────────────────────────────────────────────────────

  settings: router({
    all: publicProcedure.query(async () => {
      return getAllSettings();
    }),

    get: publicProcedure
      .input(z.object({ key: z.string() }))
      .query(async ({ input }) => {
        return getSetting(input.key);
      }),

    set: protectedProcedure
      .input(z.object({ key: z.string(), value: z.string() }))
      .mutation(async ({ input }) => {
        await setSetting(input.key, input.value);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
