import { describe, it, expect, vi } from 'vitest';

// util.promisify.custom symbol — stable across Node versions.
// We attach it to our mock so promisify(mockExecFile) returns { stdout, stderr }.
const PROMISIFY_CUSTOM = Symbol.for('nodejs.util.promisify.custom');

const { mockExecFile, mockExecFileCustom } = vi.hoisted(() => {
  const customFn = vi.fn();
  const fn = vi.fn() as any;
  fn[Symbol.for('nodejs.util.promisify.custom')] = customFn;
  return { mockExecFile: fn, mockExecFileCustom: customFn };
});

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, execFile: mockExecFile };
});

import { searchYtDlp, detectRateLimit } from '../../scripts/curate/lib/yt-dlp';

describe('yt-dlp wrapper', () => {
  it('searchYtDlp returns parsed array of {id, title, duration}', async () => {
    mockExecFileCustom.mockResolvedValueOnce({
      stdout: '{"id":"abc","title":"A","duration":120}\n{"id":"def","title":"B","duration":90}',
      stderr: '',
    });

    const results = await searchYtDlp('test query', 30);
    expect(results).toEqual([
      { id: 'abc', title: 'A', duration: 120 },
      { id: 'def', title: 'B', duration: 90 },
    ]);
  });

  it('detectRateLimit returns true on HTTP 429', () => {
    expect(detectRateLimit('ERROR: HTTP Error 429: Too Many Requests')).toBe(true);
  });

  it('detectRateLimit returns true on Sign in to confirm', () => {
    expect(detectRateLimit('ERROR: Sign in to confirm your age')).toBe(true);
  });

  it('detectRateLimit returns false for normal stderr', () => {
    expect(detectRateLimit('some normal warning')).toBe(false);
  });
});
