import { describe, it, expect } from 'vitest';
import { toEmbedUrl } from '../../src/lib/utils/youtube';

describe('toEmbedUrl', () => {
  it('converts youtube.com/watch?v=ID', () => {
    expect(toEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'))
      .toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  });

  it('converts youtube.com/shorts/ID', () => {
    expect(toEmbedUrl('https://www.youtube.com/shorts/U4Dc9LDkjx8'))
      .toBe('https://www.youtube-nocookie.com/embed/U4Dc9LDkjx8');
  });

  it('converts youtu.be/ID', () => {
    expect(toEmbedUrl('https://youtu.be/abcdEFGhij1'))
      .toBe('https://www.youtube-nocookie.com/embed/abcdEFGhij1');
  });

  it('passes through already-embed URL', () => {
    expect(toEmbedUrl('https://www.youtube.com/embed/abcdEFGhij1'))
      .toBe('https://www.youtube-nocookie.com/embed/abcdEFGhij1');
  });

  it('returns null for empty string', () => {
    expect(toEmbedUrl('')).toBeNull();
  });

  it('returns null for invalid URL', () => {
    expect(toEmbedUrl('not-a-url')).toBeNull();
  });

  it('returns null for non-YouTube host', () => {
    expect(toEmbedUrl('https://vimeo.com/123456')).toBeNull();
  });

  it('returns null when video ID is too short', () => {
    expect(toEmbedUrl('https://youtu.be/abc')).toBeNull();
  });

  it('returns null when video ID contains invalid chars', () => {
    expect(toEmbedUrl('https://youtu.be/!@#$%^&*()_+')).toBeNull();
  });

  it('returns null when watch URL has no v param', () => {
    expect(toEmbedUrl('https://www.youtube.com/watch?foo=bar')).toBeNull();
  });

  it('handles youtu.be with trailing query string', () => {
    expect(toEmbedUrl('https://youtu.be/abcdEFGhij1?t=10'))
      .toBe('https://www.youtube-nocookie.com/embed/abcdEFGhij1');
  });
});
