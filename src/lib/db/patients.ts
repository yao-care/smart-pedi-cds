import { db, type Patient, type RiskLevel } from './schema';

export async function getAllPatients(): Promise<Patient[]> {
  // Return all patients sorted by risk level (critical first), then by name
  const patients = await db.patients.toArray();
  const levelOrder: Record<RiskLevel, number> = { critical: 0, warning: 1, advisory: 2, normal: 3 };
  return patients.sort((a, b) => {
    const levelDiff = levelOrder[a.currentRiskLevel] - levelOrder[b.currentRiskLevel];
    if (levelDiff !== 0) return levelDiff;
    return (a.name ?? '').localeCompare(b.name ?? '');
  });
}

export async function getPatient(id: string): Promise<Patient | undefined> {
  return db.patients.get(id);
}

export async function upsertPatient(patient: Patient): Promise<void> {
  await db.patients.put(patient);
}

export async function updateRiskLevel(id: string, level: RiskLevel): Promise<void> {
  await db.patients.update(id, { currentRiskLevel: level });
}

export async function getPatientsByRiskLevel(level: RiskLevel): Promise<Patient[]> {
  return db.patients.where('currentRiskLevel').equals(level).toArray();
}

export async function getRiskSummary(): Promise<Record<RiskLevel, number>> {
  const summary: Record<RiskLevel, number> = { normal: 0, advisory: 0, warning: 0, critical: 0 };
  await db.patients.each(p => { summary[p.currentRiskLevel]++; });
  return summary;
}

export async function deleteOldPatients(olderThan: Date): Promise<number> {
  return db.patients.where('lastSyncedAt').below(olderThan).delete();
}
