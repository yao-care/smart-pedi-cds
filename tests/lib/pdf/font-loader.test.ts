import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadChineseFontInto } from '../../../src/lib/pdf/font-loader';

const fontModuleR = "export const NotoSansTC_Regular_base64 = 'AAAAREGULAR';\n";
const fontModuleB = "export const NotoSansTC_Bold_base64 = 'BBBBOLD';\n";

describe('font-loader', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('regular')) return new Response(fontModuleR);
        if (url.includes('bold')) return new Response(fontModuleB);
        return new Response('', { status: 404 });
      }),
    );
  });

  it('registers Regular and Bold with Identity-H encoding', async () => {
    const doc = {
      addFileToVFS: vi.fn(),
      addFont: vi.fn(),
    };

    await loadChineseFontInto(doc as never);

    expect(doc.addFileToVFS).toHaveBeenCalledWith('NotoSansTC-Regular.ttf', 'AAAAREGULAR');
    expect(doc.addFileToVFS).toHaveBeenCalledWith('NotoSansTC-Bold.ttf', 'BBBBOLD');
    expect(doc.addFont).toHaveBeenCalledWith(
      'NotoSansTC-Regular.ttf',
      'NotoSansTC',
      'normal',
      'Identity-H',
    );
    expect(doc.addFont).toHaveBeenCalledWith(
      'NotoSansTC-Bold.ttf',
      'NotoSansTC',
      'bold',
      'Identity-H',
    );
  });

  it('caches across calls (only one fetch pair)', async () => {
    const fetchSpy = vi.mocked(globalThis.fetch);
    const doc1 = { addFileToVFS: vi.fn(), addFont: vi.fn() };
    const doc2 = { addFileToVFS: vi.fn(), addFont: vi.fn() };

    await loadChineseFontInto(doc1 as never);
    const callsAfterFirst = fetchSpy.mock.calls.length;
    await loadChineseFontInto(doc2 as never);
    expect(fetchSpy.mock.calls.length).toBe(callsAfterFirst);
    expect(doc2.addFileToVFS).toHaveBeenCalled();
  });

  it('throws on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    // Reset cached module-level state
    const fresh = await vi.importActual<typeof import('../../../src/lib/pdf/font-loader')>(
      '../../../src/lib/pdf/font-loader',
    );
    const doc = { addFileToVFS: vi.fn(), addFont: vi.fn() };
    await expect(fresh.loadChineseFontInto(doc as never)).rejects.toThrow(/500/);
  });
});
