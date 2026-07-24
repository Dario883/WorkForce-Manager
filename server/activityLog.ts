import { db } from "./db";
import { activityLog } from "./schema";
import type { AuthPayload } from "./auth";

type ActivityAction = "created" | "updated" | "deleted";

/**
 * Records an audit entry. Failures are logged but never thrown — losing an
 * activity-log row must not fail the actual request that triggered it.
 */
export async function logActivity(
  user: AuthPayload,
  action: ActivityAction,
  entityType: string,
  entityId: number,
  entityName: string,
  detail?: string
) {
  try {
    await db.insert(activityLog).values({
      userId: user.userId,
      userName: user.name,
      action,
      entityType,
      entityId,
      entityName,
      detail: detail ?? null,
    });
  } catch (err) {
    console.error("Errore durante la scrittura del registro attività:", err);
  }
}
