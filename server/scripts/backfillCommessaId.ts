import "dotenv/config";
import { db, pool } from "../db";
import { projects } from "../schema";
import { eq, isNull } from "drizzle-orm";
import { buildCommessaId } from "../commessaId";

async function run() {
  const rows = await db.select().from(projects).where(isNull(projects.commessaId));
  const used = new Set<string>();

  for (const p of rows) {
    let commessaId = buildCommessaId(p.name, p.createdAt);
    while (used.has(commessaId)) {
      commessaId = `${commessaId}-${p.id}`;
    }
    used.add(commessaId);
    await db.update(projects).set({ commessaId }).where(eq(projects.id, p.id));
    console.log(`${p.id}: ${p.name} -> ${commessaId}`);
  }

  console.log(`Backfilled ${rows.length} project(s).`);
  await pool.end();
}

run().catch((err) => {
  console.error("Errore backfill commessaId:", err);
  process.exit(1);
});
