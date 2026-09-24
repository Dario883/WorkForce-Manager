import "dotenv/config";
import { db, pool } from "./db";
import { users } from "./schema";
import { hashPassword } from "./auth";

async function seed() {
  const existing = await db.select().from(users).limit(1);
  if (existing.length > 0) {
    console.log("Un utente esiste già, seed saltato.");
    await pool.end();
    return;
  }

  const email = process.env.SEED_ADMIN_EMAIL || "admin@example.com";
  const password = process.env.SEED_ADMIN_PASSWORD || "";
  const name = process.env.SEED_ADMIN_NAME || "Admin";

  if (!password) {
    throw new Error("SEED_ADMIN_PASSWORD must be configured before running the seed");
  }

  const passwordHash = await hashPassword(password);
  await db.insert(users).values({ email, passwordHash, name });

  console.log(`Utente admin creato: ${email}`);
  console.log("Imposta una nuova password dopo il primo accesso.");
  await pool.end();
}

seed().catch((err) => {
  console.error("Errore durante il seed:", err);
  process.exit(1);
});
