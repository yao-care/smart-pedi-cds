export const INDICATOR_NAMES = [
  'heart_rate',
  'spo2',
  'respiratory_rate',
  'temperature',
  'sleep_quality',
  'activity_level',
  'sugar_intake',
] as const;

export type IndicatorName = typeof INDICATOR_NAMES[number];

export const LOINC_CODES: Record<IndicatorName, string> = {
  heart_rate: '8867-4',
  spo2: '2708-6',
  respiratory_rate: '9279-1',
  temperature: '8310-5',
  sleep_quality: '93832-4',
  activity_level: '82290-8',
  sugar_intake: '2339-0',
} as const;

// Reverse map: LOINC code -> indicator name
const LOINC_TO_INDICATOR = new Map<string, IndicatorName>(
  Object.entries(LOINC_CODES).map(([name, code]) => [code, name as IndicatorName])
);

/** Lookup indicator name by LOINC code */
export function indicatorByLoinc(code: string): IndicatorName | undefined {
  return LOINC_TO_INDICATOR.get(code);
}

/** Lookup LOINC code by indicator name */
export function loincByIndicator(indicator: string): string | undefined {
  return LOINC_CODES[indicator as IndicatorName];
}

/** Human-readable display name in Chinese */
export const INDICATOR_LABELS: Record<IndicatorName, string> = {
  heart_rate: '心率',
  spo2: '血氧飽和度',
  respiratory_rate: '呼吸頻率',
  temperature: '體溫',
  sleep_quality: '睡眠品質',
  activity_level: '活動量',
  sugar_intake: '醣類攝取',
};

/** Units for each indicator */
export const INDICATOR_UNITS: Record<IndicatorName, string> = {
  heart_rate: 'bpm',
  spo2: '%',
  respiratory_rate: 'breaths/min',
  temperature: '°C',
  sleep_quality: '分',
  activity_level: '分',
  sugar_intake: 'g',
};
