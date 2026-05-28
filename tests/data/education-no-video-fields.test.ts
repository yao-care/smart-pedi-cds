import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Education markdown 為「純文章衛教」的單一來源 — 不可含影片欄位。
 *
 * 歷史包袱：early 版本 schema 容許 markdown frontmatter 帶 videoUrl + triggerIndicators，
 * 與後來 Phase 4 設計的 video catalog yaml 形成雙資料來源、UI 渲染分岔。
 *
 * 修正：2026-05-21 把 5 篇 nutrition markdown 的 videoUrl 移進 video-catalog/pro-kol.yaml，
 * 改 schema 禁止 format='video'。本測試守住此 invariant — 防止未來 PR 又把影片塞回 markdown。
 *
 * 違反此守則的正確修法：把影片元資料寫進 src/data/video-catalog/<tier>.yaml + 對應 trigger
 * 寫進 src/data/education/content-relevance.yaml，不要動 markdown。
 */
describe('education markdown — single-source invariant', () => {
  it('沒有任何 .md 含 videoUrl frontmatter 欄位', async () => {
    const dir = 'src/data/education';
    const files = await collectMarkdown(dir);
    const offenders: string[] = [];
    for (const f of files) {
      const content = await fs.readFile(f, 'utf8');
      const frontmatter = extractFrontmatter(content);
      if (/^videoUrl:/m.test(frontmatter)) {
        offenders.push(f);
      }
    }
    expect(offenders, 'videoUrl 應寫進 video-catalog/*.yaml 而非 markdown').toEqual([]);
  });

  it('沒有任何 .md 含 triggerIndicators frontmatter 欄位', async () => {
    const dir = 'src/data/education';
    const files = await collectMarkdown(dir);
    const offenders: string[] = [];
    for (const f of files) {
      const content = await fs.readFile(f, 'utf8');
      const frontmatter = extractFrontmatter(content);
      if (/^triggerIndicators:/m.test(frontmatter)) {
        offenders.push(f);
      }
    }
    expect(offenders, 'trigger 對應應寫進 content-relevance.yaml').toEqual([]);
  });

  it('沒有任何 .md 含 format: "video"', async () => {
    const dir = 'src/data/education';
    const files = await collectMarkdown(dir);
    const offenders: string[] = [];
    for (const f of files) {
      const content = await fs.readFile(f, 'utf8');
      const frontmatter = extractFrontmatter(content);
      if (/^format:\s*["']?video["']?\s*$/m.test(frontmatter)) {
        offenders.push(f);
      }
    }
    expect(offenders, 'format=video markdown 改為 article + 影片寫進 yaml catalog').toEqual([]);
  });

  it('沒有任何 .md 含 format: "questionnaire"（評估問卷在 /, 不在衛教頁）', async () => {
    const dir = 'src/data/education';
    const files = await collectMarkdown(dir);
    const offenders: string[] = [];
    for (const f of files) {
      const content = await fs.readFile(f, 'utf8');
      const frontmatter = extractFrontmatter(content);
      if (/^format:\s*["']?questionnaire["']?\s*$/m.test(frontmatter)) {
        offenders.push(f);
      }
    }
    expect(offenders, 'questionnaire = 評估流程的 questions.json；衛教頁不放問卷').toEqual([]);
  });
});

async function collectMarkdown(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      files.push(...await collectMarkdown(p));
    } else if (e.name.endsWith('.md')) {
      files.push(p);
    }
  }
  return files;
}

function extractFrontmatter(content: string): string {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  return m ? m[1] : '';
}
