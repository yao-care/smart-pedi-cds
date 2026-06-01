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

  /** 把目前 auth 寫進 sessionStorage，供跨頁（/launch/ → /workspace/）交接。 */
  persistToSession(): void {
    sessionStorage.setItem('smartAuth', JSON.stringify({
      accessToken: this.accessToken,
      baseUrl: this.fhirBaseUrl,
      fhirUser: this.fhirUser,
      scopes: this.scopes,
    }));
  }

  /** 從 sessionStorage 還原 auth（workspace 等頁掛載時呼叫）。 */
  hydrateFromSession(): void {
    const raw = sessionStorage.getItem('smartAuth');
    if (!raw) return;
    try {
      const a = JSON.parse(raw) as { accessToken: string; baseUrl: string; fhirUser: string; scopes: string[] };
      if (a.accessToken) this.setAuth(a.accessToken, a.baseUrl, a.fhirUser, a.scopes);
    } catch {
      /* 損毀的 session 資料：忽略，維持未登入 */
    }
  }
}

export const authStore = new AuthStore();
