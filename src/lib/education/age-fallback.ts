import type { AgeGroupCDSA } from '../utils/age-groups';

/** §3.6 chain：先試最鄰近年齡 bin，衛教鄰近性 > 發展階段相同性。
 *  Fallback 永遠不跨越 inapplicable: true（由 tryAgeGroupFallback 實施）。 */
export const CDSA_FALLBACK_CHAIN: Record<AgeGroupCDSA, AgeGroupCDSA[]> = {
  '2-6m':   ['7-12m'],
  '7-12m':  ['2-6m', '13-24m'],
  '13-24m': ['7-12m', '25-36m'],
  '25-36m': ['13-24m', '37-48m'],
  '37-48m': ['25-36m', '49-60m'],
  '49-60m': ['37-48m', '61-72m'],
  '61-72m': ['49-60m'],
};
