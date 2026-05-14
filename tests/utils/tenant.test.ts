import { describe, it, expect } from 'vitest';
import { getTenantId, getTenantDisplayName } from '../../src/lib/utils/tenant';

describe('tenant', () => {
  describe('getTenantId', () => {
    it('returns "default" for null', () => {
      expect(getTenantId(null)).toBe('default');
    });

    it('uses hostname + pathname, sanitised', () => {
      expect(getTenantId('https://fhir.example.com/r4')).toBe('fhir.example.com_r4');
    });

    it('strips trailing slashes', () => {
      expect(getTenantId('https://fhir.example.com/r4/')).toBe('fhir.example.com_r4');
    });

    it('ignores port and protocol', () => {
      expect(getTenantId('https://fhir.example.com:8443/r4')).toBe('fhir.example.com_r4');
    });

    it('falls back to "default" for invalid URLs', () => {
      expect(getTenantId('not-a-url')).toBe('default');
    });

    it('replaces non-alphanumeric characters', () => {
      const id = getTenantId('https://hospital.tw/fhir+test?env=prod');
      expect(id).not.toMatch(/[+?=]/);
    });
  });

  describe('getTenantDisplayName', () => {
    it('returns hostname when URL parses', () => {
      expect(getTenantDisplayName('https://fhir.example.com/r4')).toBe('fhir.example.com');
    });

    it('returns "預設（未連線）" for null', () => {
      expect(getTenantDisplayName(null)).toBe('預設（未連線）');
    });

    it('returns raw input when URL is invalid', () => {
      expect(getTenantDisplayName('bad-url')).toBe('bad-url');
    });
  });
});
