import { describe, it, expect } from 'vitest';
import {
  riskSeverity,
  maxRisk,
  isEscalation,
  riskColor,
  riskBgColor,
} from '../../src/lib/utils/risk-levels';

describe('risk-levels', () => {
  describe('riskSeverity', () => {
    it('maps levels to 0-3', () => {
      expect(riskSeverity('normal')).toBe(0);
      expect(riskSeverity('advisory')).toBe(1);
      expect(riskSeverity('warning')).toBe(2);
      expect(riskSeverity('critical')).toBe(3);
    });
  });

  describe('maxRisk', () => {
    it('returns highest severity', () => {
      expect(maxRisk('normal', 'critical', 'advisory')).toBe('critical');
      expect(maxRisk('advisory', 'warning')).toBe('warning');
      expect(maxRisk('normal', 'normal')).toBe('normal');
    });

    it('returns normal when given no levels', () => {
      expect(maxRisk()).toBe('normal');
    });
  });

  describe('isEscalation', () => {
    it('true when severity rises', () => {
      expect(isEscalation('normal', 'advisory')).toBe(true);
      expect(isEscalation('advisory', 'critical')).toBe(true);
    });

    it('false when severity drops or equal', () => {
      expect(isEscalation('critical', 'warning')).toBe(false);
      expect(isEscalation('normal', 'normal')).toBe(false);
    });
  });

  describe('CSS helpers', () => {
    it('builds risk color variable name', () => {
      expect(riskColor('warning')).toBe('--color-risk-warning');
    });

    it('builds risk bg variable name', () => {
      expect(riskBgColor('critical')).toBe('--color-risk-critical-bg');
    });
  });
});
