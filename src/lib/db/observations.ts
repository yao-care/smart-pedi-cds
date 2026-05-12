import { db, type Observation } from './schema';

export async function addObservations(obs: Observation[]): Promise<void> {
  await db.observations.bulkPut(obs);
}

export async function getLatestObservations(patientId: string): Promise<Record<string, Observation>> {
  // Get the most recent observation for each indicator for a patient
  const all = await db.observations
    .where('patientId')
    .equals(patientId)
    .toArray();

  const latest: Record<string, Observation> = {};
  for (const obs of all) {
    const existing = latest[obs.indicator];
    if (!existing || obs.effectiveDateTime > existing.effectiveDateTime) {
      latest[obs.indicator] = obs;
    }
  }
  return latest;
}

export async function getObservationHistory(
  patientId: string,
  indicator: string,
  since: Date,
): Promise<Observation[]> {
  return db.observations
    .where('[patientId+indicator]')
    .equals([patientId, indicator])
    .filter(obs => obs.effectiveDateTime >= since)
    .sortBy('effectiveDateTime');
}

export async function getObservationCount(
  patientId: string,
  indicator: string,
): Promise<number> {
  return db.observations
    .where('[patientId+indicator]')
    .equals([patientId, indicator])
    .count();
}

export async function deleteOldObservations(olderThan: Date): Promise<number> {
  return db.observations.where('effectiveDateTime').below(olderThan).delete();
}
