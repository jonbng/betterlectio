export interface AvanceretSkemaCacheParams {
  afdelingId: string;
  subcache: string;
}

const AVANCERET_SKEMA_PATTERN = /AvanceretSkema_(\d+)_(\d{4})/;

function parseAvanceretSkemaParams(source: string): AvanceretSkemaCacheParams | null {
  const match = source.match(AVANCERET_SKEMA_PATTERN);
  if (!match) return null;
  return { afdelingId: match[1], subcache: match[2] };
}

export async function resolveAvanceretSkemaCacheParams(
  schoolId: string
): Promise<AvanceretSkemaCacheParams | null> {
  const scripts = document.querySelectorAll('script');
  for (const script of scripts) {
    const content = script.textContent;
    if (!content) continue;
    const parsed = parseAvanceretSkemaParams(content);
    if (parsed) return parsed;
  }

  try {
    const advUrl = `${window.location.origin}/lectio/${schoolId}/FindSkemaAdv.aspx`;
    const html = await fetch(advUrl).then((res) => res.text());
    return parseAvanceretSkemaParams(html);
  } catch {
    return null;
  }
}
