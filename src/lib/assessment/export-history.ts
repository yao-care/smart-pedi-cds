import type { Child, Assessment } from '../db/schema';

/** One child plus all their assessments — the unit the history view groups by. */
export interface ChildAssessments {
  child: Child;
  assessments: Assessment[];
}

/** Portable, self-describing snapshot of the user's local assessment data.
 *  Followup B3 (2026-07-08): pure data portability — the user downloads their
 *  OWN IndexedDB records to their OWN device. Nothing is uploaded, so unlike the
 *  outward-facing PDF / FHIR / GCM paths (Patient ID only) this may include local
 *  identifiers such as `child.nickName` — it is the user's data, and exporting it
 *  is the whole point. `format` + `version` let a future importer recognise the
 *  shape. */
export interface HistoryExport {
  format: 'smart-pedi-history';
  version: 1;
  exportedAt: string; // ISO-8601
  children: ChildAssessments[];
}

/** Build the export payload. Pure + deterministic (takes `exportedAt` so tests
 *  don't depend on the clock). Deep-clones through JSON to strip Svelte `$state`
 *  proxies and normalise Date → ISO string, matching how the records serialise. */
export function buildHistoryExport(
  data: ChildAssessments[],
  exportedAt: string,
): HistoryExport {
  return {
    format: 'smart-pedi-history',
    version: 1,
    exportedAt,
    children: data.map(({ child, assessments }) => ({
      child: JSON.parse(JSON.stringify(child)) as Child,
      assessments: JSON.parse(JSON.stringify(assessments)) as Assessment[],
    })),
  };
}

/** Deterministic filename, e.g. `smart-pedi-history-2026-07-08.json`. */
export function historyExportFilename(exportedAt: string): string {
  return `smart-pedi-history-${exportedAt.slice(0, 10)}.json`;
}

/** Total assessment count across all children (for the button label / a11y). */
export function countExportedAssessments(data: ChildAssessments[]): number {
  return data.reduce((sum, c) => sum + c.assessments.length, 0);
}

/** Serialise + trigger a client-side download. Browser-only (uses Blob / anchor);
 *  no network, no upload. Separated from `buildHistoryExport` so the payload
 *  shaping stays unit-testable without a DOM. */
export function triggerJsonDownload(payload: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
