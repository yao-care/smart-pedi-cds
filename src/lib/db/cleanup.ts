import { db } from './schema';

const MAX_AGE_DAYS = 90;

/**
 * Delete old data from IndexedDB (>90 days).
 * Call periodically to prevent storage bloat.
 */
export async function cleanupOldData(): Promise<{ deleted: Record<string, number> }> {
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
  const deleted: Record<string, number> = {};

  // Old observations
  deleted.observations = await db.observations
    .where('effectiveDateTime')
    .below(cutoff)
    .delete();

  // Old alerts (only resolved/false_positive)
  const oldAlerts = await db.alerts
    .where('createdAt')
    .below(cutoff)
    .filter(a => a.status === 'resolved' || a.status === 'false_positive')
    .toArray();
  await db.alerts.bulkDelete(oldAlerts.map(a => a.id));
  deleted.alerts = oldAlerts.length;

  // Old assessment events
  deleted.assessmentEvents = await db.assessmentEvents
    .where('timestamp')
    .below(cutoff)
    .delete();

  // Old webhook history
  deleted.webhookHistory = await db.webhookHistory
    .where('createdAt')
    .below(cutoff)
    .delete();

  // Old education interactions
  deleted.educationInteractions = await db.educationInteractions
    .where('createdAt')
    .below(cutoff)
    .delete();

  return { deleted };
}
