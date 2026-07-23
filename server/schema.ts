import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  varchar,
  date,
  real,
  pgEnum,
} from "drizzle-orm/pg-core";

export const projectStatusEnum = pgEnum("project_status", [
  "planned",
  "active",
  "on_hold",
  "completed",
]);

export const assignmentPeriodEnum = pgEnum("assignment_period_type", [
  "day",
  "week",
  "month",
  "year",
]);

// ── Users (auth) ──────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── People (risorse) ─────────────────────────────────────────────────────
export const people = pgTable("people", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  role: varchar("role", { length: 255 }),
  avatarColor: varchar("avatar_color", { length: 32 }).default("#3457d5").notNull(),
  capacityHoursPerWeek: real("capacity_hours_per_week").default(40).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Projects (progetti) ──────────────────────────────────────────────────
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  client: varchar("client", { length: 255 }),
  status: projectStatusEnum("status").default("planned").notNull(),
  color: varchar("color", { length: 32 }).default("#3457d5").notNull(),
  startDate: date("start_date"),
  endDate: date("end_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Assignments (staffing: persona x progetto x periodo x %) ────────────
export const assignments = pgTable("assignments", {
  id: serial("id").primaryKey(),
  personId: integer("person_id")
    .references(() => people.id, { onDelete: "cascade" })
    .notNull(),
  projectId: integer("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  percentage: real("percentage").notNull(), // 0-100+ (>100 = sovra-allocazione)
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  periodType: assignmentPeriodEnum("period_type").default("week").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Settings (chiave-valore) ──────────────────────────────────────────────
export const settings = pgTable("settings", {
  key: varchar("key", { length: 128 }).primaryKey(),
  value: text("value").notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Person = typeof people.$inferSelect;
export type InsertPerson = typeof people.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;
export type Assignment = typeof assignments.$inferSelect;
export type InsertAssignment = typeof assignments.$inferInsert;
