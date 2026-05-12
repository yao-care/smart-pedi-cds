import { db, type Alert, type AlertStatus } from './schema';

export async function createAlert(alert: Alert): Promise<string> {
  await db.alerts.put(alert);
  return alert.id;
}

export async function getOpenAlerts(patientId?: string): Promise<Alert[]> {
  if (patientId) {
    return db.alerts
      .where('[patientId+status]')
      .equals([patientId, 'open'])
      .reverse()
      .sortBy('createdAt');
  }
  return db.alerts
    .where('status')
    .equals('open')
    .reverse()
    .sortBy('createdAt');
}

export async function getAlertsByStatus(status: AlertStatus, limit?: number): Promise<Alert[]> {
  const collection = db.alerts.where('status').equals(status);
  const results = await collection.reverse().sortBy('createdAt');
  return limit ? results.slice(0, limit) : results;
}

export async function updateAlertStatus(
  id: string,
  status: AlertStatus,
  notes?: string,
  acknowledgedBy?: string,
): Promise<void> {
  const update: Partial<Alert> = { status };
  if (notes !== undefined) update.notes = notes;
  if (acknowledgedBy !== undefined) update.acknowledgedBy = acknowledgedBy;
  if (status === 'resolved' || status === 'false_positive') {
    update.closedAt = new Date();
  }
  await db.alerts.update(id, update);
}

export async function getAlertHistory(patientId: string, since: Date): Promise<Alert[]> {
  return db.alerts
    .where('patientId')
    .equals(patientId)
    .filter(a => a.createdAt >= since)
    .sortBy('createdAt');
}

export async function findDuplicateAlert(
  patientId: string,
  indicators: string[],
  windowMinutes: number,
): Promise<Alert | undefined> {
  const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);
  const recent = await db.alerts
    .where('[patientId+status]')
    .equals([patientId, 'open'])
    .filter(a => a.createdAt >= cutoff)
    .toArray();

  return recent.find(a =>
    a.indicators.some(ind => indicators.includes(ind))
  );
}

export async function getAlertChain(alertId: string): Promise<Alert[]> {
  const chain: Alert[] = [];
  let currentId: string | undefined = alertId;

  while (currentId) {
    const alert: Alert | undefined = await db.alerts.get(currentId);
    if (!alert || chain.some(a => a.id === alert.id)) break; // prevent loops
    chain.unshift(alert); // prepend for chronological order
    currentId = alert.parentAlertId;
  }
  return chain;
}

export async function batchUpdateStatus(ids: string[], status: AlertStatus): Promise<void> {
  await db.transaction('rw', db.alerts, async () => {
    const update: Partial<Alert> = { status };
    if (status === 'resolved' || status === 'false_positive') {
      update.closedAt = new Date();
    }
    for (const id of ids) {
      await db.alerts.update(id, update);
    }
  });
}
