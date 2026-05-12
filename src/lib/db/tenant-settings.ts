import { db, type TenantSettings } from './schema';
import { getTenantDisplayName } from '../utils/tenant';

const DEFAULTS = {
  pollingInterval: 30,
  advisoryBatchInterval: 5,
  browserNotifications: true,
  soundEnabled: true,
  alertAfterHours: 24,
};

export async function getTenantSettings(tenantId: string, fhirBaseUrl: string | null): Promise<TenantSettings> {
  const existing = await db.tenantSettings.get(tenantId);
  if (existing) return existing;

  // Return defaults
  return {
    id: tenantId,
    tenantId,
    displayName: getTenantDisplayName(fhirBaseUrl),
    ...DEFAULTS,
    updatedAt: new Date(),
  };
}

export async function saveTenantSettings(settings: TenantSettings): Promise<void> {
  await db.tenantSettings.put({ ...settings, updatedAt: new Date() });
}
