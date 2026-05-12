import type { Alert } from '../lib/db/schema';
import { db } from '../lib/db/schema';

export interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  triggerLevels: ('advisory' | 'warning' | 'critical')[];
  enabled: boolean;
}

export interface WebhookPayload {
  patient_id: string;
  risk_level: string;
  rationale: string;
  timestamp: string;
  indicators: string[];
  alert_id: string;
}

export class WebhookManager {
  private configs: WebhookConfig[] = [];

  /** Load webhook configs from IndexedDB */
  async loadConfigs(): Promise<void> {
    // Store webhook configs in serverConfigs table using a convention
    // Or use a simple in-memory approach since webhooks are configured via UI
    // For now, configs are set via setConfigs()
  }

  setConfigs(configs: WebhookConfig[]): void {
    this.configs = configs;
  }

  /** Dispatch alert to all matching webhooks */
  async dispatch(alert: Alert): Promise<void> {
    const payload: WebhookPayload = {
      patient_id: alert.patientId,
      risk_level: alert.riskLevel,
      rationale: alert.rationale,
      timestamp: alert.createdAt.toISOString(),
      indicators: alert.indicators,
      alert_id: alert.id,
    };

    const matching = this.configs.filter(
      c => c.enabled && c.triggerLevels.includes(alert.riskLevel as 'advisory' | 'warning' | 'critical')
    );

    await Promise.allSettled(
      matching.map(config => this.sendWebhook(config, alert.id, payload))
    );
  }

  private async sendWebhook(
    config: WebhookConfig,
    alertId: string,
    payload: WebhookPayload,
  ): Promise<void> {
    let status: 'success' | 'failed' = 'failed';
    let statusCode: number | undefined;

    try {
      const response = await fetch(config.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      statusCode = response.status;
      status = response.ok ? 'success' : 'failed';
    } catch {
      status = 'failed';
    }

    // Record history
    await db.webhookHistory.put({
      id: crypto.randomUUID(),
      webhookId: config.id,
      alertId,
      url: config.url,
      status,
      statusCode,
      createdAt: new Date(),
    });
  }

  /** Send a test webhook */
  async testWebhook(config: WebhookConfig): Promise<{ success: boolean; statusCode?: number }> {
    const testPayload: WebhookPayload = {
      patient_id: 'test-patient',
      risk_level: 'warning',
      rationale: 'This is a test webhook from CDSS',
      timestamp: new Date().toISOString(),
      indicators: ['heart_rate'],
      alert_id: 'test-alert',
    };

    try {
      const response = await fetch(config.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload),
      });
      return { success: response.ok, statusCode: response.status };
    } catch {
      return { success: false };
    }
  }
}
