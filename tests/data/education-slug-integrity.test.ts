import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import yaml from 'js-yaml';

interface ContentRelevance {
  triggers: Array<{ articles?: Array<{ slug: string }> }>;
}

describe('educationSlug integrity', () => {
  it('every article slug in content-relevance.yaml has corresponding markdown', async () => {
    const f = 'src/data/education/content-relevance.yaml';
    const relevance = yaml.load(await fs.readFile(f, 'utf8')) as ContentRelevance;
    const slugs = new Set<string>();
    for (const t of relevance.triggers ?? []) {
      for (const a of t.articles ?? []) slugs.add(a.slug);
    }
    for (const slug of slugs) {
      const mdPath = `src/data/education/${slug}.md`;
      await expect(fs.access(mdPath)).resolves.toBeUndefined();
    }
  });
});
