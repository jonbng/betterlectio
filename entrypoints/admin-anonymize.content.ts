const FIRST_NAMES = [
  'Alma', 'Anna', 'Astrid', 'Clara', 'Ella', 'Emma', 'Freja', 'Ida', 'Laura',
  'Lea', 'Maja', 'Nora', 'Olivia', 'Sofie', 'Christian', 'Emil', 'Frederik',
  'Lucas', 'Magnus', 'Mathias', 'Mikkel', 'Noah', 'Oliver', 'Oscar', 'Rasmus',
  'Sebastian', 'Victor',
];

const LAST_NAMES = [
  'Andersen', 'Christensen', 'Hansen', 'Jensen', 'Jørgensen', 'Larsen',
  'Madsen', 'Nielsen', 'Pedersen', 'Petersen', 'Rasmussen', 'Sørensen',
];

const PHOTO_PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="96" height="120" viewBox="0 0 96 120">
    <rect width="96" height="120" fill="#d4d4d8"/>
    <circle cx="48" cy="40" r="19" fill="#a1a1aa"/>
    <ellipse cx="48" cy="104" rx="34" ry="32" fill="#a1a1aa"/>
  </svg>
`)}`;

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function initials(name: string): string {
  return name.split(/\s+/).map((part) => part[0]).join('').toUpperCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default defineContentScript({
  matches: ['https://*.lectio.dk/*'],
  runAt: 'document_idle',
  main() {
    const aliasById = new Map<string, string>();
    const replacementByName = new Map<string, string>();
    const exactReplacementByName = new Map<string, string>();
    let observer: MutationObserver | null = null;
    let queued = false;
    let applying = false;

    const aliasFor = (contextId: string): string => {
      const existing = aliasById.get(contextId);
      if (existing) return existing;
      const seed = hash(contextId);
      const first = FIRST_NAMES[seed % FIRST_NAMES.length];
      const last = LAST_NAMES[Math.floor(seed / FIRST_NAMES.length) % LAST_NAMES.length];
      const alias = `${first} ${last}`;
      aliasById.set(contextId, alias);
      return alias;
    };

    const rememberName = (realName: string, alias: string, allowSingle = false) => {
      const clean = realName.trim().replace(/\s+/g, ' ');
      if (clean.length < 2) return;
      if (clean.includes(' ')) replacementByName.set(clean, alias);
      else if (allowSingle) exactReplacementByName.set(clean, alias.split(' ')[0]);
    };

    const contextIdOf = (element: Element): string =>
      element.getAttribute('data-lectioContextCard')
      || element.getAttribute('data-lectiocontextcard')
      || '';

    const learnAndRewriteContextCards = (root: ParentNode) => {
      const cards = root.querySelectorAll<HTMLElement>(
        '[data-lectioContextCard^="S"], [data-lectiocontextcard^="S"], '
        + '[data-lectioContextCard^="T"], [data-lectiocontextcard^="T"]',
      );
      cards.forEach((card) => {
        const contextId = contextIdOf(card);
        if (!/^[ST]/.test(contextId)) return;
        const alias = aliasFor(contextId);
        const original = card.textContent?.trim().replace(/\s+/g, ' ') || '';
        const teacherMatch = original.match(/^(.+?)\s*\(([^)]+)\)$/);

        if (teacherMatch) {
          rememberName(teacherMatch[1], alias);
          card.textContent = `${alias} (${initials(alias)})`;
        } else if (contextId.startsWith('T') && /^[A-ZÆØÅ]{1,5}$/.test(original)) {
          card.textContent = initials(alias);
        } else if (original) {
          rememberName(original, alias);
          card.textContent = alias;
        }

        if (card.hasAttribute('title')) card.setAttribute('title', alias);
        if (card.hasAttribute('aria-label')) card.setAttribute('aria-label', alias);
      });
    };

    const replaceKnownNames = (root: ParentNode) => {
      if (replacementByName.size === 0 && exactReplacementByName.size === 0) return;
      const replacements = [...replacementByName.entries()].sort((a, b) => b[0].length - a[0].length);
      const aliases = new Set(aliasById.values());
      const fullNamePattern = replacements.length > 0
        ? new RegExp(replacements.map(([name]) => escapeRegExp(name)).join('|'), 'g')
        : null;
      const singleNamePattern = exactReplacementByName.size > 0
        ? new RegExp(
          `(^|[^\\p{L}])(${[...exactReplacementByName.keys()].map(escapeRegExp).join('|')})(?=$|[^\\p{L}])`,
          'gu',
        )
        : null;
      const replaceInValue = (original: string): string => {
        if ([...aliases].some((alias) => original.includes(alias))) return original;
        let value = original;
        if (fullNamePattern) {
          value = value.replace(fullNamePattern, (name) => replacementByName.get(name) || name);
        }
        if (singleNamePattern) {
          value = value.replace(singleNamePattern, (_match, prefix: string, name: string) => (
            `${prefix}${exactReplacementByName.get(name) || name}`
          ));
        }
        return value;
      };
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA'].includes(parent.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }
          return node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
      });
      const nodes: Text[] = [];
      while (walker.nextNode()) nodes.push(walker.currentNode as Text);
      nodes.forEach((node) => {
        const value = replaceInValue(node.data);
        if (value !== node.data) node.data = value;
      });

      root.querySelectorAll<HTMLElement>('[title], [aria-label], [alt]').forEach((element) => {
        ['title', 'aria-label', 'alt'].forEach((attribute) => {
          const original = element.getAttribute(attribute);
          if (!original) return;
          const value = replaceInValue(original);
          if (value !== original) element.setAttribute(attribute, value);
        });
      });
    };

    const redactPhotos = (root: ParentNode) => {
      root.querySelectorAll<HTMLImageElement>([
        '[data-slot="avatar-image"]',
        'img[class*="avatar"]',
        'img[class*="object-top"]',
        'img[src*="GetImage"]',
        'img[src*="getimage"]',
        'img[src*="profil"]',
        'img[src*="Profile"]',
        '[data-lectioContextCard^="S"] img',
        '[data-lectiocontextcard^="S"] img',
        '[data-lectioContextCard^="T"] img',
        '[data-lectiocontextcard^="T"] img',
      ].join(', ')).forEach((image) => {
        if (image.src === PHOTO_PLACEHOLDER) return;
        image.removeAttribute('srcset');
        image.removeAttribute('data-src');
        image.src = PHOTO_PLACEHOLDER;
        image.alt = '';
        image.style.objectFit = 'cover';
        image.style.background = '#d4d4d8';
      });
    };

    const apply = (root: ParentNode = document) => {
      if (applying) return;
      applying = true;
      observer?.disconnect();
      try {
        learnAndRewriteContextCards(root);
        replaceKnownNames(root);
        redactPhotos(root);
      } finally {
        applying = false;
        if (document.documentElement) observer?.observe(document.documentElement, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ['src', 'srcset', 'title', 'alt', 'aria-label'],
        });
      }
    };

    const queueApply = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        apply(document);
      });
    };

    const learnCachedNames = async () => {
      const schoolId = location.pathname.match(/\/lectio\/(\d+)\//)?.[1];
      if (!schoolId) return;

      try {
        const profileRaw = localStorage.getItem(`bl-user-profile:${schoolId}`)
          || localStorage.getItem('bl-user-profile')
          || localStorage.getItem('il-user-profile');
        if (profileRaw) {
          const profile = JSON.parse(profileRaw) as {
            studentId?: string;
            fullName?: string;
            name?: string;
          };
          if (profile.studentId) {
            const alias = aliasFor(`S${profile.studentId}`);
            if (profile.fullName) rememberName(profile.fullName, alias);
            if (profile.name) rememberName(profile.name, alias, true);
          }
        }
      } catch {
        // A malformed cache must not stop DOM-based anonymization.
      }

      try {
        const teacherRaw = localStorage.getItem('bl-teacher-names')
          || localStorage.getItem('il-teacher-names');
        if (teacherRaw) {
          const teacherCache = JSON.parse(teacherRaw) as {
            schoolId?: string;
            byId?: Record<string, { fullName?: string; abbrev?: string }>;
          };
          if (teacherCache.schoolId === schoolId) {
            Object.entries(teacherCache.byId || {}).forEach(([id, teacher]) => {
              const alias = aliasFor(`T${id}`);
              if (teacher.fullName) rememberName(teacher.fullName, alias);
            });
          }
        }
      } catch {
        // Live teacher context cards remain as a fallback.
      }

      try {
        const storage = await browser.storage.local.get(null);
        const prefix = `bl-sb:${schoolId}:students:`;
        Object.entries(storage).forEach(([key, value]) => {
          if (!key.startsWith(prefix)) return;
          const rows = (value as { data?: unknown })?.data;
          if (!Array.isArray(rows)) return;
          rows.forEach((row) => {
            if (!row || typeof row !== 'object') return;
            const student = row as {
              id?: string;
              name?: string | null;
              lectio_first_name?: string | null;
              lectio_last_name?: string | null;
            };
            if (!student.id) return;
            const alias = aliasFor(`S${student.id}`);
            if (student.name) rememberName(student.name, alias, true);
            const lectioName = [student.lectio_first_name, student.lectio_last_name]
              .filter(Boolean)
              .join(' ');
            if (lectioName) rememberName(lectioName, alias);
          });
        });
        queueApply();
      } catch {
        // The directory and live DOM remain as fallbacks.
      }
    };

    const start = () => {
      observer = new MutationObserver(queueApply);
      apply(document);
      void learnCachedNames();
    };

    // Let BetterLectio snapshot Lectio's untouched native DOM and establish its
    // imported identity before privacy mode starts rewriting presentation.
    window.setTimeout(start, 250);
  },
});
