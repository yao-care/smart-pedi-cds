import { describe, it, expect, beforeEach } from 'vitest';
import { authStore } from '../../../src/lib/stores/auth.svelte';

describe('authStore.hydrateFromSession', () => {
  beforeEach(() => {
    authStore.clearAuth();
    sessionStorage.clear();
  });

  it('從 sessionStorage[smartAuth] 還原 auth', () => {
    sessionStorage.setItem('smartAuth', JSON.stringify({
      accessToken: 'AT', baseUrl: 'https://h/fhir', fhirUser: 'Practitioner/1',
      scopes: ['patient/*.read'],
    }));
    authStore.hydrateFromSession();
    expect(authStore.isAuthenticated).toBe(true);
    expect(authStore.fhirBaseUrl).toBe('https://h/fhir');
  });

  it('無 smartAuth 時維持未登入', () => {
    authStore.hydrateFromSession();
    expect(authStore.isAuthenticated).toBe(false);
  });
});
