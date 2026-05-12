class AuthStore {
  accessToken = $state<string | null>(null);
  fhirBaseUrl = $state<string | null>(null);
  fhirUser = $state<string | null>(null);
  scopes = $state<string[]>([]);

  isAuthenticated = $derived(this.accessToken !== null);
  canWrite = $derived(this.scopes.some(s => s.includes('.write') || s.includes('/*.')));
  canReadPatients = $derived(
    this.scopes.some(s => s.includes('Patient.read') || s.includes('/*.read'))
  );

  setAuth(token: string, baseUrl: string, user: string, scopes: string[]): void {
    this.accessToken = token;
    this.fhirBaseUrl = baseUrl;
    this.fhirUser = user;
    this.scopes = scopes;
  }

  clearAuth(): void {
    this.accessToken = null;
    this.fhirBaseUrl = null;
    this.fhirUser = null;
    this.scopes = [];
  }
}

export const authStore = new AuthStore();
