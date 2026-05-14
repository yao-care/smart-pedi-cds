import type { Alert } from '../lib/db/schema';

export interface NotificationConfig {
  enabled: boolean;
  soundEnabled: boolean;
  advisoryBatchIntervalMs: number;  // batch advisory notifications
  soundUrl: string;                  // critical alert sound
}

export class NotificationManager {
  private config: NotificationConfig;
  private advisoryBatch: Alert[] = [];
  private batchTimer: ReturnType<typeof setInterval> | null = null;
  private audioElement: HTMLAudioElement | null = null;

  constructor(config: NotificationConfig) {
    this.config = config;
  }

  /** Request notification permission */
  async requestPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) return 'denied';
    if (Notification.permission === 'granted') return 'granted';
    return Notification.requestPermission();
  }

  /** Send alert notification based on level */
  async notify(alert: Alert): Promise<void> {
    if (!this.config.enabled) return;

    switch (alert.riskLevel) {
      case 'advisory':
        this.batchAdvisory(alert);
        break;
      case 'warning':
        await this.showNotification(
          `Warning — Patient ${alert.patientId}`,
          alert.rationale,
        );
        break;
      case 'critical':
        await this.showNotification(
          `CRITICAL — Patient ${alert.patientId}`,
          alert.rationale,
        );
        if (this.config.soundEnabled) {
          this.playAlertSound();
        }
        break;
    }
  }

  private batchAdvisory(alert: Alert): void {
    this.advisoryBatch.push(alert);
    if (!this.batchTimer) {
      this.batchTimer = setInterval(() => {
        this.flushAdvisoryBatch();
      }, this.config.advisoryBatchIntervalMs);
    }
  }

  private async flushAdvisoryBatch(): Promise<void> {
    if (this.advisoryBatch.length === 0) return;

    const count = this.advisoryBatch.length;
    const patients = [...new Set(this.advisoryBatch.map(a => a.patientId))];

    await this.showNotification(
      `${count} advisory notice(s)`,
      `Involving ${patients.length} patient(s): ${patients.slice(0, 3).join(', ')}${patients.length > 3 ? '...' : ''}`,
    );
    this.advisoryBatch = [];
  }

  private async showNotification(title: string, body: string): Promise<void> {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    new Notification(title, {
      body,
      icon: '/favicon.svg',
      tag: `cdss-${Date.now()}`,
    });
  }

  private playAlertSound(): void {
    try {
      if (!this.audioElement) {
        this.audioElement = new Audio(this.config.soundUrl);
      }
      this.audioElement.currentTime = 0;
      this.audioElement.play().catch(() => {
        // Audio autoplay may be blocked — ignore
      });
    } catch {
      // Audio not supported
    }
  }

  /** Update config dynamically */
  updateConfig(config: Partial<NotificationConfig>): void {
    Object.assign(this.config, config);
  }

  destroy(): void {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
    this.advisoryBatch = [];
  }
}
