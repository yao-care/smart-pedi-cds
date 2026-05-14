import FHIR from 'fhirclient';
import type Client from 'fhirclient/lib/Client';

let _client: Client | null = null;

export interface SmartConfiguration {
  authorization_endpoint: string;
  token_endpoint: string;
  capabilities?: string[];
}

/**
 * Initialize standalone SMART launch — redirects to authorization server.
 */
export async function initStandalone(
  fhirBaseUrl: string,
  clientId: string,
  scopes: string,
  redirectUri?: string,
): Promise<void> {
  await FHIR.oauth2.authorize({
    iss: fhirBaseUrl,
    clientId,
    scope: scopes,
    redirectUri: redirectUri ?? window.location.origin + '/launch/',
    pkceMode: 'ifSupported',
  });
}

/**
 * Initialize EHR launch — reads launch + iss from URL params.
 */
export async function initEhrLaunch(): Promise<void> {
  await FHIR.oauth2.authorize({
    pkceMode: 'ifSupported',
  });
}

/**
 * Complete the OAuth callback and get the authorized client.
 */
export async function completeAuth(): Promise<Client> {
  _client = await FHIR.oauth2.ready();
  return _client;
}

/**
 * Get the current authorized FHIR client.
 * Throws if not yet authorized.
 */
export function getClient(): Client {
  if (!_client) throw new Error('FHIR client not initialized. Call completeAuth() first.');
  return _client;
}

/** Check if client is authorized */
export function isAuthorized(): boolean {
  return _client !== null;
}

/** Get current access token */
export function getAccessToken(): string {
  if (!_client) return '';
  const state = _client.state;
  return state.tokenResponse?.access_token ?? '';
}

/** Get FHIR user claim */
export function getFhirUser(): string {
  if (!_client) return '';
  const state = _client.state;
  return (state.tokenResponse as Record<string, unknown>)?.fhirUser as string ?? '';
}

/** Get granted scopes */
export function getScopes(): string[] {
  if (!_client) return [];
  const state = _client.state;
  const scope = (state.tokenResponse as Record<string, unknown>)?.scope as string ?? '';
  return scope.split(' ').filter(Boolean);
}

/**
 * Refresh the access token using the refresh_token.
 */
export async function refreshToken(): Promise<void> {
  if (!_client) throw new Error('FHIR client not initialized');
  await _client.refresh();
}

/**
 * Discover SMART configuration from .well-known endpoint.
 */
export async function discoverSmartConfig(fhirBaseUrl: string): Promise<SmartConfiguration> {
  const url = `${fhirBaseUrl.replace(/\/$/, '')}/.well-known/smart-configuration`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to discover SMART configuration: ${response.status}`);
  }
  return response.json();
}

/** Clear the client (on logout) */
export function clearClient(): void {
  _client = null;
}
