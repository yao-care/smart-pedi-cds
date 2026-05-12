import type { Alert, AlertStatus } from '../db/schema';
import type { RiskLevel } from '../utils/risk-levels';
import * as alertDao from '../db/alerts';

class AlertStore {
  alerts = $state<Alert[]>([]);
  filterLevel = $state<RiskLevel | 'all'>('all');
  filterStatus = $state<AlertStatus | 'all'>('all');
  isLoading = $state(false);

  filteredAlerts = $derived.by(() => {
    let result = this.alerts;
    if (this.filterLevel !== 'all') {
      result = result.filter(a => a.riskLevel === this.filterLevel);
    }
    if (this.filterStatus !== 'all') {
      result = result.filter(a => a.status === this.filterStatus);
    }
    return result;
  });

  openCount = $derived(this.alerts.filter(a => a.status === 'open').length);

  criticalCount = $derived(
    this.alerts.filter(a => a.riskLevel === 'critical' && a.status === 'open').length
  );

  async loadAlerts(): Promise<void> {
    this.isLoading = true;
    try {
      this.alerts = await alertDao.getOpenAlerts();
    } finally {
      this.isLoading = false;
    }
  }

  async loadAllAlerts(): Promise<void> {
    this.isLoading = true;
    try {
      const open = await alertDao.getAlertsByStatus('open');
      const ack = await alertDao.getAlertsByStatus('acknowledged');
      const fp = await alertDao.getAlertsByStatus('false_positive');
      const resolved = await alertDao.getAlertsByStatus('resolved');
      this.alerts = [...open, ...ack, ...fp, ...resolved];
    } finally {
      this.isLoading = false;
    }
  }

  async acknowledgeAlert(id: string, notes?: string): Promise<void> {
    await alertDao.updateAlertStatus(id, 'acknowledged', notes);
    const idx = this.alerts.findIndex(a => a.id === id);
    if (idx !== -1) {
      this.alerts[idx] = { ...this.alerts[idx], status: 'acknowledged', notes };
    }
  }

  async markFalsePositive(id: string, notes?: string): Promise<void> {
    await alertDao.updateAlertStatus(id, 'false_positive', notes);
    const idx = this.alerts.findIndex(a => a.id === id);
    if (idx !== -1) {
      this.alerts[idx] = { ...this.alerts[idx], status: 'false_positive', notes, closedAt: new Date() };
    }
  }

  async batchAcknowledge(ids: string[]): Promise<void> {
    await alertDao.batchUpdateStatus(ids, 'acknowledged');
    for (const id of ids) {
      const idx = this.alerts.findIndex(a => a.id === id);
      if (idx !== -1) {
        this.alerts[idx] = { ...this.alerts[idx], status: 'acknowledged' };
      }
    }
  }

  setFilterLevel(level: RiskLevel | 'all'): void {
    this.filterLevel = level;
  }

  setFilterStatus(status: AlertStatus | 'all'): void {
    this.filterStatus = status;
  }
}

export const alertStore = new AlertStore();
