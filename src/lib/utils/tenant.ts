/**
 * Derive a stable tenant ID from a FHIR server URL.
 * Returns 'default' when not connected.
 */
export function getTenantId(fhirBaseUrl: string | null): string {
  if (!fhirBaseUrl) return 'default';
  try {
    const url = new URL(fhirBaseUrl);
    // Use hostname + pathname as tenant key (strips protocol/port)
    return `${url.hostname}${url.pathname}`.replace(/\/+$/, '').replace(/[^a-zA-Z0-9.-]/g, '_');
  } catch {
    return 'default';
  }
}

/**
 * Get display name for a tenant.
 */
export function getTenantDisplayName(fhirBaseUrl: string | null): string {
  if (!fhirBaseUrl) return '預設（未連線）';
  try {
    const url = new URL(fhirBaseUrl);
    return url.hostname;
  } catch {
    return fhirBaseUrl;
  }
}
