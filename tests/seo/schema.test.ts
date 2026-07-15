import { describe, it, expect } from 'vitest';
import {
  organizationSchema,
  webSiteSchema,
  softwareApplicationSchema,
  medicalWebPageSchema,
  articleListSchema,
  breadcrumbSchema,
  faqPageSchema,
} from '../../src/lib/seo/schema';

const site = new URL('https://smart-pedi-cds.yao.care/');

describe('organizationSchema', () => {
  it('帶 @type Organization 與機構名', () => {
    const s = organizationSchema(site);
    expect(s['@context']).toBe('https://schema.org');
    expect(s['@type']).toBe('Organization');
    expect(s.name).toBe('yao.care 藥提醒科技');
    expect(s.url).toBe('https://yao.care');
  });
  it('輸出 sameAs，且每筆為官方據點的 https URL', () => {
    const s = organizationSchema(site) as Record<string, unknown> & { sameAs?: string[] };
    expect(Array.isArray(s.sameAs)).toBe(true);
    expect(s.sameAs!.length).toBeGreaterThan(0);
    for (const url of s.sameAs!) expect(url).toMatch(/^https:\/\//);
    // 僅列本專案實際經營的據點，勿混入未經營的社群帳號
    expect(s.sameAs).toContain('https://github.com/yao-care/smart-pedi-cds');
  });
});

describe('softwareApplicationSchema — citation（評估依據來源）', () => {
  it('輸出 citation，每筆具 name 與 https URL', () => {
    const s = softwareApplicationSchema(site) as Record<string, unknown> & {
      citation?: { '@type': string; name: string; url: string }[];
    };
    expect(Array.isArray(s.citation)).toBe(true);
    expect(s.citation!.length).toBeGreaterThanOrEqual(2);
    for (const c of s.citation!) {
      expect(c['@type']).toBe('CreativeWork');
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.url).toMatch(/^https:\/\//);
    }
  });

  it('citation 不得含佔位或明顯捏造的路徑', () => {
    const s = softwareApplicationSchema(site) as Record<string, unknown> & {
      citation?: { url: string }[];
    };
    // 曾誤將憑印象拼出的 hpa.gov.tw Detail.aspx 路徑寫入（實測 404）。
    // 引用來源之 URL 必須實測可達後才可加入 site.ts 的 citations。
    for (const c of s.citation!) {
      expect(c.url).not.toMatch(/example\.com|TODO|placeholder|xxx/i);
      expect(c.url).not.toMatch(/hpa\.gov\.tw\/Pages\/Detail\.aspx\?nodeid=1600/);
    }
  });
});

describe('webSiteSchema', () => {
  it('含 SearchAction，target 指向 /search', () => {
    const s = webSiteSchema(site);
    expect(s['@type']).toBe('WebSite');
    expect(s.name).toBe('Smart Pedi 兒童發展評估');
    expect(s.potentialAction['@type']).toBe('SearchAction');
    expect(s.potentialAction.target).toContain('/search?q=');
  });
});

describe('softwareApplicationSchema', () => {
  it('免費 HealthApplication', () => {
    const s = softwareApplicationSchema(site);
    expect(s['@type']).toBe('SoftwareApplication');
    expect(s.applicationCategory).toBe('HealthApplication');
    expect(s.offers.price).toBe('0');
    expect(s.isAccessibleForFree).toBe(true);
  });
});

describe('medicalWebPageSchema', () => {
  const s = medicalWebPageSchema(site, {
    title: '語言發展',
    summary: '摘要',
    ageGroups: ['toddler'],
    url: 'https://smart-pedi-cds.yao.care/education/lang/',
    publishedAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-02-01'),
  });
  it('MedicalWebPage + 兒科 specialty + 家長 audience', () => {
    expect(s['@type']).toBe('MedicalWebPage');
    expect(s.specialty).toBe('Pediatrics');
    expect(s.audience['@type']).toBe('MedicalAudience');
    expect(s.audience.audienceType).toBe('Parent');
  });
  it('日期：dateModified 用 updatedAt，缺則用 publishedAt', () => {
    expect(s.datePublished).toBe('2026-01-01T00:00:00.000Z');
    expect(s.dateModified).toBe('2026-02-01T00:00:00.000Z');
    const s2 = medicalWebPageSchema(site, {
      title: 't', summary: 's', ageGroups: ['infant'],
      url: 'https://x/', publishedAt: new Date('2026-01-01'),
    });
    expect(s2.dateModified).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('articleListSchema', () => {
  it('ItemList，position 從 1 起', () => {
    const s = articleListSchema([
      { name: 'A', url: 'https://x/a/' },
      { name: 'B', url: 'https://x/b/' },
    ]);
    expect(s['@type']).toBe('ItemList');
    expect(s.itemListElement[0].position).toBe(1);
    expect(s.itemListElement[1].name).toBe('B');
  });
});

describe('breadcrumbSchema', () => {
  it('BreadcrumbList，含 href 才有 item', () => {
    const s = breadcrumbSchema(site, [
      { label: '首頁', href: '/' },
      { label: '當前' },
    ]);
    expect(s['@type']).toBe('BreadcrumbList');
    expect(s.itemListElement[0].item).toBe('https://smart-pedi-cds.yao.care/');
    expect('item' in s.itemListElement[1]).toBe(false);
  });
});

describe('faqPageSchema', () => {
  it('FAQPage，每題轉 Question/Answer', () => {
    const s = faqPageSchema([{ question: 'Q1', answer: 'A1' }]);
    expect(s['@type']).toBe('FAQPage');
    expect(s.mainEntity[0]['@type']).toBe('Question');
    expect(s.mainEntity[0].acceptedAnswer.text).toBe('A1');
  });
});

describe('序列化', () => {
  it('所有工廠輸出可 JSON.stringify', () => {
    expect(() => JSON.stringify([
      organizationSchema(site), webSiteSchema(site),
      softwareApplicationSchema(site),
    ])).not.toThrow();
  });
});
