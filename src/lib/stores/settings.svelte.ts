const SETTINGS_KEY = 'user-preferences';

interface UserPreferences {
  pollingInterval: number;      // seconds
  advisoryBatchInterval: number; // minutes
  browserNotifications: boolean;
  soundEnabled: boolean;
  alertAfterHours: number;
}

const DEFAULTS: UserPreferences = {
  pollingInterval: 30,
  advisoryBatchInterval: 5,
  browserNotifications: true,
  soundEnabled: true,
  alertAfterHours: 24,
};

class SettingsStore {
  pollingInterval = $state(DEFAULTS.pollingInterval);
  advisoryBatchInterval = $state(DEFAULTS.advisoryBatchInterval);
  browserNotifications = $state(DEFAULTS.browserNotifications);
  soundEnabled = $state(DEFAULTS.soundEnabled);
  alertAfterHours = $state(DEFAULTS.alertAfterHours);
  isLoaded = $state(false);

  async load(): Promise<void> {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) {
        const prefs: UserPreferences = JSON.parse(stored);
        this.pollingInterval = prefs.pollingInterval ?? DEFAULTS.pollingInterval;
        this.advisoryBatchInterval = prefs.advisoryBatchInterval ?? DEFAULTS.advisoryBatchInterval;
        this.browserNotifications = prefs.browserNotifications ?? DEFAULTS.browserNotifications;
        this.soundEnabled = prefs.soundEnabled ?? DEFAULTS.soundEnabled;
        this.alertAfterHours = prefs.alertAfterHours ?? DEFAULTS.alertAfterHours;
      }
    } catch {
      // Use defaults on error
    }
    this.isLoaded = true;
  }

  async save(): Promise<void> {
    const prefs: UserPreferences = {
      pollingInterval: this.pollingInterval,
      advisoryBatchInterval: this.advisoryBatchInterval,
      browserNotifications: this.browserNotifications,
      soundEnabled: this.soundEnabled,
      alertAfterHours: this.alertAfterHours,
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(prefs));
  }

  reset(): void {
    this.pollingInterval = DEFAULTS.pollingInterval;
    this.advisoryBatchInterval = DEFAULTS.advisoryBatchInterval;
    this.browserNotifications = DEFAULTS.browserNotifications;
    this.soundEnabled = DEFAULTS.soundEnabled;
    this.alertAfterHours = DEFAULTS.alertAfterHours;
    localStorage.removeItem(SETTINGS_KEY);
  }
}

export const settingsStore = new SettingsStore();
