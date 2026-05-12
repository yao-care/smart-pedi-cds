import type { Patient } from '../db/schema';
import type { RiskLevel } from '../utils/risk-levels';
import * as patientDao from '../db/patients';

class PatientStore {
  patients = $state<Patient[]>([]);
  selectedPatientId = $state<string | null>(null);
  isLoading = $state(false);
  lastError = $state<string | null>(null);

  selectedPatient = $derived(
    this.patients.find(p => p.id === this.selectedPatientId) ?? null
  );

  riskSummary = $derived.by(() => {
    const summary: Record<RiskLevel, number> = { normal: 0, advisory: 0, warning: 0, critical: 0 };
    for (const p of this.patients) {
      summary[p.currentRiskLevel]++;
    }
    return summary;
  });

  patientCount = $derived(this.patients.length);

  criticalCount = $derived(
    this.patients.filter(p => p.currentRiskLevel === 'critical').length
  );

  async loadPatients(): Promise<void> {
    this.isLoading = true;
    this.lastError = null;
    try {
      this.patients = await patientDao.getAllPatients();
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : 'Failed to load patients';
    } finally {
      this.isLoading = false;
    }
  }

  selectPatient(id: string | null): void {
    this.selectedPatientId = id;
  }

  async updateRiskLevel(patientId: string, level: RiskLevel): Promise<void> {
    await patientDao.updateRiskLevel(patientId, level);
    // Update local state
    const idx = this.patients.findIndex(p => p.id === patientId);
    if (idx !== -1) {
      this.patients[idx] = { ...this.patients[idx], currentRiskLevel: level };
    }
  }
}

export const patientStore = new PatientStore();
