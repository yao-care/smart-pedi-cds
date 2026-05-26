import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import yaml from 'js-yaml';

interface ContentRelevance {
  triggers: Array<{ trigger: string }>;
}

describe('trigger key uniqueness in content-relevance.yaml', () => {
  it('no duplicate trigger in content-relevance.yaml', async () => {
    const f = 'src/data/education/content-relevance.yaml';
    const relevance = yaml.load(await fs.readFile(f, 'utf8')) as ContentRelevance;
    const all = new Map<string, string>();
    for (const t of relevance.triggers ?? []) {
      if (all.has(t.trigger)) {
        throw new Error(`Duplicate trigger ${t.trigger} in ${f}`);
      }
      all.set(t.trigger, f);
    }
    expect(all.size).toBeGreaterThanOrEqual(0);
  });
});
