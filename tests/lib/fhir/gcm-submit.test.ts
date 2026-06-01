// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { b64url, makePkce } from '../../../src/lib/fhir/gcm-submit';

describe('b64url', () => {
  it('產生 URL-safe base64（無 +/= ）', () => {
    const out = b64url(new Uint8Array([251, 252, 253, 254, 255]));
    expect(out).not.toMatch(/[+/=]/);
  });
});

describe('makePkce', () => {
  it('challenge = b64url(SHA-256(verifier))', async () => {
    const { verifier, challenge } = await makePkce();
    expect(verifier.length).toBeGreaterThan(20);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    expect(challenge).toBe(b64url(new Uint8Array(digest)));
  });
});
