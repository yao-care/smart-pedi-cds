/**
 * Convert any YouTube URL form to a youtube-nocookie.com embed URL.
 * Returns null for non-YouTube URLs or unparseable input.
 */
export function toEmbedUrl(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    let id: string | null = null;

    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') {
        id = u.searchParams.get('v');
      } else if (u.pathname.startsWith('/shorts/')) {
        id = u.pathname.split('/')[2] ?? null;
      } else if (u.pathname.startsWith('/embed/')) {
        id = u.pathname.split('/')[2] ?? null;
      }
    } else if (host === 'youtu.be') {
      id = u.pathname.slice(1).split('/')[0];
    }

    if (!id || !/^[\w-]{11}$/.test(id)) return null;
    return `https://www.youtube-nocookie.com/embed/${id}`;
  } catch {
    return null;
  }
}
