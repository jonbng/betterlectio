export function normalizeInstagramHandle(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  let handle = trimmed;

  const urlMatch = handle.match(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^/?#]+)/i);
  if (urlMatch?.[1]) {
    handle = urlMatch[1];
  }

  handle = handle.replace(/^@+/, '').replace(/^\/+|\/+$/g, '').trim();

  return handle || null;
}

export function formatInstagramHandle(value: string | null | undefined): string {
  const handle = normalizeInstagramHandle(value);
  return handle ? `@${handle}` : '';
}

export function getInstagramProfileUrl(value: string | null | undefined): string | null {
  const handle = normalizeInstagramHandle(value);
  return handle ? `https://instagram.com/${handle}` : null;
}
