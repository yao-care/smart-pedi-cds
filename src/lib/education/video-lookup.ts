import type { CustomVideo, RuntimeIndex, RuntimeVideo } from './schemas';
import { AGE_GROUPS_CDSA, type AgeGroupCDSA } from '../utils/age-groups';
import { mergeCustomVideos } from './merge-custom-videos';
import { CDSA_FALLBACK_CHAIN } from './age-fallback';

const CDSA_TRIGGER_REGEX = new RegExp(
  `^(cdsa\\.(?:triage|domain)\\..+)\\.(${AGE_GROUPS_CDSA.join('|')})$`,
);

let indexPromise: Promise<RuntimeIndex> | null = null;

function loadIndex(): Promise<RuntimeIndex> {
  if (!indexPromise) {
    indexPromise = fetch(`${import.meta.env.BASE_URL}data/video-index.json`)
      .then(r => {
        if (!r.ok) throw new Error(`video-index.json fetch failed: ${r.status}`);
        return r.json() as Promise<RuntimeIndex>;
      })
      .catch(err => {
        indexPromise = null;
        throw err;
      });
  }
  return indexPromise;
}

export interface VideoLookupOptions {
  maxResults?: number;
  ageGroupFallback?: boolean;
}

export function tryAgeGroupFallback(trigger: string, idx: RuntimeIndex): string[] {
  const m = trigger.match(CDSA_TRIGGER_REGEX);
  if (!m) return [];
  const [, prefix, currentAge] = m;
  const chain = CDSA_FALLBACK_CHAIN[currentAge as AgeGroupCDSA] ?? [];
  for (const altAge of chain) {
    const altTrigger = `${prefix}.${altAge}`;
    const altEntry = idx.triggers[altTrigger];
    if (!altEntry || altEntry.inapplicable) continue;
    if (altEntry.videoIds.length === 0) continue;
    return altEntry.videoIds;
  }
  return [];
}

export async function getVideosForTrigger(
  trigger: string,
  customVideos: CustomVideo[] = [],
  options: VideoLookupOptions = {},
): Promise<RuntimeVideo[]> {
  const idx = await loadIndex();
  const entry = idx.triggers[trigger];

  if (entry?.inapplicable) return [];

  const opts = { maxResults: 3, ageGroupFallback: false, ...options };
  let ids = entry?.videoIds ?? [];
  if (ids.length === 0 && opts.ageGroupFallback) {
    ids = tryAgeGroupFallback(trigger, idx);
  }

  const staticVideos = ids
    .map(id => idx.catalog[id])
    .filter((v): v is RuntimeVideo => v != null)
    .sort((a, b) => b.score - a.score);

  return mergeCustomVideos(staticVideos, customVideos, trigger, opts);
}

export async function getVideosForTriggers(
  triggerList: string[],
  customVideos: CustomVideo[] = [],
  options?: VideoLookupOptions,
): Promise<Record<string, RuntimeVideo[]>> {
  const results = await Promise.all(
    triggerList.map(async t => [t, await getVideosForTrigger(t, customVideos, options)] as const),
  );
  return Object.fromEntries(results);
}
