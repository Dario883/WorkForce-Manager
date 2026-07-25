import "dotenv/config";
import { addDays, format } from "date-fns";
import { eq } from "drizzle-orm";
import { db, pool } from "./db";
import { people, projects, assignments, absences, holidays, personCapacityPeriods } from "./schema";
import { buildCommessaId } from "./commessaId";

// Adds realistic example data across every section (people, projects,
// staffing, absences, holidays, variable capacity) without touching or
// duplicating anything that already exists — safe to re-run.

const today = new Date();
const d = (offsetDays: number) => format(addDays(today, offsetDays), "yyyy-MM-dd");

async function seedDemoData() {
  console.log("Popolamento dati di esempio...");

  // ── People ────────────────────────────────────────────────────────────
  const newPeopleData = [
    { name: "Laura Ferrari", email: "laura.ferrari@example.com", role: "Project Manager", avatarColor: "#3987e5", capacityHoursPerWeek: 40, isApprover: true },
    { name: "Elena Ricci", email: "elena.ricci@example.com", role: "Team Lead", avatarColor: "#d95926", capacityHoursPerWeek: 40, isApprover: true },
    { name: "Marco Esposito", email: "marco.esposito@example.com", role: "Business Analyst", avatarColor: "#199e70", capacityHoursPerWeek: 36 },
    { name: "Chiara Romano", email: "chiara.romano@example.com", role: "QA Engineer", avatarColor: "#c98500", capacityHoursPerWeek: 32 },
    { name: "Davide Conti", email: "davide.conti@example.com", role: "UX Designer", avatarColor: "#d55181", capacityHoursPerWeek: 40 },
    { name: "Francesco Greco", email: "francesco.greco@example.com", role: "Junior Developer", avatarColor: "#008300", capacityHoursPerWeek: 40 },
  ] as const;

  const idByName: Record<string, number> = {};
  for (const p of newPeopleData) {
    const [existing] = await db.select().from(people).where(eq(people.email, p.email)).limit(1);
    if (existing) {
      idByName[p.name] = existing.id;
      continue;
    }
    const [created] = await db.insert(people).values(p).returning();
    idByName[p.name] = created.id;
  }

  async function setManager(personName: string, managerName: string) {
    const pid = idByName[personName];
    const mid = idByName[managerName];
    if (pid && mid) await db.update(people).set({ managerId: mid }).where(eq(people.id, pid));
  }
  await setManager("Marco Esposito", "Elena Ricci");
  await setManager("Chiara Romano", "Laura Ferrari");
  await setManager("Davide Conti", "Laura Ferrari");
  await setManager("Francesco Greco", "Elena Ricci");

  // Full people table (existing + just-inserted) for cross-references below.
  const allPeople = await db.select().from(people);
  const personId = (name: string) => idByName[name] ?? allPeople.find((p) => p.name === name)?.id;

  // ── Projects ──────────────────────────────────────────────────────────
  const newProjectsData = [
    { name: "Portale HR", client: "TIM", status: "active" as const, deliveryType: "AMS" as const, color: "#3987e5", startDate: d(-30), endDate: d(10), pm: "Elena Ricci" },
    { name: "Migrazione Cloud", client: "Poste Italiane", status: "planned" as const, deliveryType: "TaaS" as const, color: "#199e70", startDate: d(7), endDate: d(120), pm: "Laura Ferrari" },
    { name: "App Mobile Banking", client: "Intesa", status: "active" as const, deliveryType: "T&M" as const, color: "#d55181", startDate: d(-60), endDate: d(180), pm: "Elena Ricci" },
    { name: "Refactoring Legacy", client: "Generali", status: "on_hold" as const, deliveryType: "AMS" as const, color: "#c98500", startDate: d(-90), endDate: d(30), pm: null },
    { name: "Data Warehouse", client: "Enel", status: "completed" as const, deliveryType: "TK" as const, color: "#008300", startDate: d(-200), endDate: d(-30), pm: "Laura Ferrari" },
    { name: "Supporto Infrastruttura", client: "Acme Spa", status: "active" as const, deliveryType: "AMS" as const, color: "#d95926", startDate: d(-400), endDate: d(400), pm: null },
  ] as const;

  const projIdByName: Record<string, number> = {};
  for (const proj of newProjectsData) {
    const [existing] = await db.select().from(projects).where(eq(projects.name, proj.name)).limit(1);
    if (existing) {
      projIdByName[proj.name] = existing.id;
      continue;
    }
    const createdAt = new Date();
    const [created] = await db
      .insert(projects)
      .values({
        commessaId: buildCommessaId(proj.name, createdAt),
        name: proj.name,
        client: proj.client,
        status: proj.status,
        deliveryType: proj.deliveryType,
        color: proj.color,
        pmId: proj.pm ? personId(proj.pm) : null,
        startDate: proj.startDate,
        endDate: proj.endDate,
        createdAt,
      })
      .returning();
    projIdByName[proj.name] = created.id;
  }

  const allProjects = await db.select().from(projects);
  const projectId = (name: string) => projIdByName[name] ?? allProjects.find((p) => p.name === name)?.id;

  // ── Assignments (staffing) ───────────────────────────────────────────
  const newAssignments = [
    { person: "Laura Ferrari", project: "Migrazione Cloud", percentage: 20, start: d(7), end: d(120) },
    { person: "Marco Esposito", project: "Portale HR", percentage: 60, start: d(-14), end: d(10) },
    { person: "Marco Esposito", project: "Migrazione Cloud", percentage: 30, start: d(7), end: d(90) },
    { person: "Chiara Romano", project: "App Mobile Banking", percentage: 50, start: d(-14), end: d(60) },
    { person: "Chiara Romano", project: "PowerApp", percentage: 25, start: d(-7), end: d(30) },
    { person: "Davide Conti", project: "Portale HR", percentage: 40, start: d(-14), end: d(10) },
    { person: "Davide Conti", project: "Migrazione ERP", percentage: 15, start: d(-7), end: d(45) },
    { person: "Elena Ricci", project: "Portale HR", percentage: 20, start: d(-14), end: d(10) },
    { person: "Elena Ricci", project: "App Mobile Banking", percentage: 20, start: d(-14), end: d(60) },
    { person: "Francesco Greco", project: "App Mobile Banking", percentage: 70, start: d(-14), end: d(30) },
    { person: "Francesco Greco", project: "Portale HR", percentage: 40, start: d(-14), end: d(10) },
  ] as const;

  for (const a of newAssignments) {
    const pid = personId(a.person);
    const prid = projectId(a.project);
    if (!pid || !prid) {
      console.warn("Salto assegnazione (persona/progetto non trovati):", a.person, a.project);
      continue;
    }
    await db.insert(assignments).values({
      personId: pid,
      projectId: prid,
      percentage: a.percentage,
      startDate: a.start,
      endDate: a.end,
      periodType: "week",
    });
  }

  // ── Absences ──────────────────────────────────────────────────────────
  const newAbsences = [
    { person: "Marco Esposito", type: "ferie" as const, status: "approvata" as const, start: d(15), end: d(20) },
    { person: "Chiara Romano", type: "malattia" as const, status: "approvata" as const, start: d(-3), end: d(-1) },
    { person: "Davide Conti", type: "permesso" as const, status: "in_attesa" as const, start: d(2), end: d(2) },
    { person: "Francesco Greco", type: "formazione" as const, status: "approvata" as const, start: d(30), end: d(32) },
    { person: "Elena Ricci", type: "ferie" as const, status: "in_attesa" as const, start: d(40), end: d(50) },
    { person: "Giulio Golia", type: "altro" as const, status: "rifiutata" as const, start: d(5), end: d(6) },
    { person: "Andrea Bianchi", type: "malattia" as const, status: "approvata" as const, start: d(-10), end: d(-8) },
  ] as const;

  for (const a of newAbsences) {
    const pid = personId(a.person);
    if (!pid) {
      console.warn("Salto assenza (persona non trovata):", a.person);
      continue;
    }
    await db.insert(absences).values({
      personId: pid,
      type: a.type,
      status: a.status,
      startDate: a.start,
      endDate: a.end,
    });
  }

  // ── Holidays (festività fisse italiane) ──────────────────────────────
  const year = today.getFullYear();
  const holidayList = [
    { date: `${year}-01-01`, name: "Capodanno" },
    { date: `${year}-01-06`, name: "Epifania" },
    { date: `${year}-04-25`, name: "Festa della Liberazione" },
    { date: `${year}-05-01`, name: "Festa dei Lavoratori" },
    { date: `${year}-06-02`, name: "Festa della Repubblica" },
    { date: `${year}-08-15`, name: "Ferragosto" },
    { date: `${year}-11-01`, name: "Ognissanti" },
    { date: `${year}-12-08`, name: "Immacolata Concezione" },
    { date: `${year}-12-25`, name: "Natale" },
    { date: `${year}-12-26`, name: "Santo Stefano" },
  ];
  for (const h of holidayList) {
    const [existing] = await db.select().from(holidays).where(eq(holidays.date, h.date)).limit(1);
    if (existing) continue;
    await db.insert(holidays).values(h);
  }

  // ── Variable capacity examples ───────────────────────────────────────
  const chiaraId = personId("Chiara Romano");
  if (chiaraId) {
    await db.insert(personCapacityPeriods).values({
      personId: chiaraId,
      startDate: d(-10),
      endDate: d(80),
      hoursPerWeek: 24,
    });
  }
  const marioId = personId("Mario Rossi");
  if (marioId) {
    await db.insert(personCapacityPeriods).values({
      personId: marioId,
      startDate: d(0),
      endDate: d(60),
      hoursPerWeek: 45,
    });
  }

  console.log("Dati di esempio popolati con successo.");
  await pool.end();
}

seedDemoData().catch((err) => {
  console.error("Errore durante il popolamento dei dati di esempio:", err);
  process.exit(1);
});
