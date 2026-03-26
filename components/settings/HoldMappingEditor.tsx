import { useEffect, useRef, useState } from 'react';
import { Pencil, RotateCcw, Sparkles, Search, Palette, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { buttonVariants } from '@/components/ui/button';
import { hydrateHoldMappingsFromSupabase, syncHoldMappingOverrideToSupabase } from '@/lib/hold-mapping-sync';
import { cn } from '@/lib/utils';
import {
  CURATED_HUES,
  getAllHolds,
  resetAllMappings,
  setHoldColorHue,
  setHoldDisplayName,
  type HoldMappingRow,
} from '@/lib/hold-mapping';
import { getLoggedInUserId } from '@/lib/profile-cache';
import { captureFeatureUsedOncePerSession, getDistinctId } from '@/lib/posthog';

// ── Autocomplete suggestions ────────────────────────────────────────────
const SUBJECT_SUGGESTIONS = [
  'Dansk', 'Matematik', 'Engelsk', 'Historie', 'Samfundsfag',
  'Fysik', 'Kemi', 'Biologi', 'Geografi', 'Tysk',
  'Fransk', 'Spansk', 'Latin', 'Religion', 'Filosofi',
  'Psykologi', 'Musik', 'Billedkunst', 'Mediefag', 'Dramatik',
  'Idræt', 'Informatik', 'Design', 'Naturvidenskab', 'Bioteknologi',
  'Oldtidskundskab', 'Erhvervsøkonomi', 'Naturgeografi', 'Astronomi',
  'Teknologi', 'Kultur- og samfundsfag', 'Idéhistorie',
  'Almen sprogforståelse', 'Almen studieforberedelse',
  'Studieretningsprojekt', 'Studieretningsopgave',
];

function normalizeForSearch(str: string): string {
  return str.toLocaleLowerCase('da').replace(/[\s\-]+/g, '');
}

function getFilteredSuggestions(query: string, currentName: string): string[] {
  if (!query.trim()) return [];
  const normalizedQuery = normalizeForSearch(query);
  return SUBJECT_SUGGESTIONS
    .filter((s) => s !== currentName && normalizeForSearch(s).includes(normalizedQuery))
    .slice(0, 6);
}

function normalizeHue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value);
  return ((rounded % 360) + 360) % 360;
}

function syncErrorMessage(prefix: string, error: unknown): string {
  const details = error instanceof Error ? error.message : String(error);
  console.warn(`[BetterLectio] ${prefix}:`, details);
  return `${prefix}: ${details}`;
}

// ── Autocomplete input ──────────────────────────────────────────────────
function AutocompleteInput({
  value,
  onCommit,
  onCancel,
  currentName,
}: {
  value: string;
  onCommit: (val: string) => void;
  onCancel: () => void;
  currentName: string;
}) {
  const [editValue, setEditValue] = useState(value);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    const filtered = getFilteredSuggestions(editValue, currentName);
    setSuggestions(filtered);
    setSelectedIndex(-1);
    setShowSuggestions(filtered.length > 0);
  }, [editValue, currentName]);

  const commit = (val?: string) => {
    const finalVal = val ?? editValue;
    const trimmed = finalVal.trim();
    if (trimmed) onCommit(trimmed);
    else onCancel();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && suggestions[selectedIndex]) {
        commit(suggestions[selectedIndex]);
      } else {
        commit();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (e.key === 'Tab' && showSuggestions && selectedIndex >= 0) {
      e.preventDefault();
      setEditValue(suggestions[selectedIndex]);
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-suggestion]');
      items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  return (
    <div className="relative" data-hold-autocomplete>
      <input
        ref={inputRef}
        type="text"
        className="w-full rounded-md border border-ring bg-background px-2 py-1 text-sm font-medium text-foreground outline-none ring-2 ring-ring/20"
        value={editValue}
        onInput={(e) => setEditValue((e.target as HTMLInputElement).value)}
        onBlur={() => {
          setTimeout(() => {
            if (!document.activeElement?.closest('[data-hold-autocomplete]')) {
              commit();
            }
          }, 150);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Skriv et fagnavn..."
      />
      {showSuggestions && (
        <div ref={listRef} className="absolute -left-2 top-[calc(100%+4px)] z-60 min-w-[200px] max-w-[280px] overflow-hidden rounded-md border border-border bg-popover p-1 shadow-lg">
          {suggestions.map((suggestion, i) => (
            <button
              key={suggestion}
              data-suggestion
              type="button"
              className={cn(
                'block w-full rounded-md border-0 bg-transparent px-2.5 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent focus:bg-accent',
                i === selectedIndex && 'bg-accent',
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(suggestion);
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Hold row ────────────────────────────────────────────────────────────
function HoldRow({ mapping, onUpdate }: { mapping: HoldMappingRow; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [showColors, setShowColors] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customHue, setCustomHue] = useState<number>(() => normalizeHue(mapping.effectiveHue));
  const colorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showCustomModal) {
      setCustomHue(normalizeHue(mapping.effectiveHue));
    }
  }, [mapping.effectiveHue, showCustomModal]);
  const isCustomHueSelected =
    mapping.colorHue !== null && !CURATED_HUES.includes(normalizeHue(mapping.colorHue));

  // Close color picker on outside click
  useEffect(() => {
    if (!showColors) return;
    const handler = (e: MouseEvent) => {
      if (colorRef.current && !colorRef.current.contains(e.target as Node)) {
        setShowColors(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showColors]);

  const commitEdit = (newName: string) => {
    if (newName !== mapping.displayName) {
      setHoldDisplayName(mapping.id, mapping.kind, newName);
      onUpdate();
      void syncHoldMappingOverrideToSupabase(mapping.id).catch((error) => {
        toast.error(syncErrorMessage('Kunne ikke synkronisere fagnavnet', error));
      });
    }
    setEditing(false);
  };

  return (
    <div className={cn('flex items-center gap-3 px-4 py-2 transition-colors hover:bg-accent/30', showColors && 'relative z-2')}>
      {/* Color dot */}
      <div className="relative shrink-0" ref={colorRef}>
        <button
          type="button"
          className="size-[22px] cursor-pointer rounded-full border-2 border-border bg-[oklch(0.65_0.18_var(--hold-hue,265))] transition-transform hover:scale-[1.18]"
          style={{ '--hold-hue': mapping.effectiveHue } as React.CSSProperties}
          onClick={() => setShowColors(!showColors)}
          title="Skift farve"
        >
          <span className="sr-only">Skift farve</span>
        </button>
        {showColors && (
          <div className="absolute left-[calc(100%+8px)] top-1/2 z-50 -translate-y-1/2 rounded-xl border border-border bg-popover p-2 shadow-lg">
            <div className="mb-2 pl-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Vælg farve</div>
            <div className="flex w-[214px] flex-wrap gap-1">
              <button
                type="button"
                className={cn(
                  'inline-flex size-6 items-center justify-center rounded-full border-2 border-border bg-muted/75 text-muted-foreground transition-all hover:scale-[1.2] hover:shadow-[0_0_0_2px_var(--ring)] hover:text-foreground',
                  mapping.colorHue === null && 'border-foreground text-foreground shadow-[0_0_0_2px_var(--ring)]',
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  setHoldColorHue(mapping.id, mapping.kind, null);
                  setShowColors(false);
                  onUpdate();
                  void syncHoldMappingOverrideToSupabase(mapping.id).catch((error) => {
                    toast.error(syncErrorMessage('Kunne ikke synkronisere farven', error));
                  });
                }}
                title="Standardfarve (nulstil)"
              >
                <RotateCcw className="size-3.5" />
                <span className="sr-only">Standardfarve</span>
              </button>
              {CURATED_HUES.map((hue) => (
                <button
                  key={hue}
                  type="button"
                  className={cn(
                    'size-6 shrink-0 rounded-full border-2.5 border-transparent bg-[oklch(0.65_0.18_var(--swatch-hue,265))] transition-all hover:scale-[1.2]',
                    mapping.colorHue === hue && 'is-active border-foreground',
                  )}
                  style={{ '--swatch-hue': hue } as React.CSSProperties}
                  onClick={(e) => {
                    e.stopPropagation();
                    setHoldColorHue(mapping.id, mapping.kind, hue);
                    setShowColors(false);
                    onUpdate();
                    void syncHoldMappingOverrideToSupabase(mapping.id).catch((error) => {
                      toast.error(syncErrorMessage('Kunne ikke synkronisere farven', error));
                    });
                  }}
                />
              ))}
              <button
                type="button"
                className={cn(
                  'inline-flex size-6 items-center justify-center rounded-full border-2 border-border bg-muted/75 text-foreground transition-all hover:shadow-[0_0_0_2px_var(--ring)]',
                  isCustomHueSelected && 'border-foreground shadow-[0_0_0_2px_var(--ring)]',
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  setCustomHue(normalizeHue(mapping.effectiveHue));
                  setShowCustomModal(true);
                }}
                title="Vælg brugerdefineret farve"
              >
                <SlidersHorizontal className="size-3.5" />
                <span className="sr-only">Vælg brugerdefineret farve</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Name + code */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {editing ? (
          <AutocompleteInput
            value={mapping.displayName}
            currentName={mapping.displayName}
            onCommit={(val) => commitEdit(val)}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <button
            type="button"
            className="group -m-0.5 flex w-fit max-w-full items-center gap-2 rounded-md border-0 bg-transparent px-1.5 py-0.5 text-sm text-foreground transition-colors hover:bg-accent/70"
            onClick={() => setEditing(true)}
            title="Klik for at redigere"
          >
            <span className="min-w-0 truncate font-medium">{mapping.displayName}</span>
            {mapping.autoGuessed ? (
              <Sparkles className="size-[11px] shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-70" />
            ) : (
              <Pencil className="size-[11px] shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-70" />
            )}
          </button>
        )}
        <span className="truncate pl-px font-mono text-xs text-muted-foreground">{mapping.codeLabel}</span>
      </div>

      {showCustomModal && (
        <div className="fixed inset-0 z-220 flex items-center justify-center p-4" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-[oklch(0_0_0/0.45)] backdrop-blur-[2px]"
            onClick={() => setShowCustomModal(false)}
            aria-label="Luk dialog"
          />
          <div
            className="relative flex w-full max-w-[420px] flex-col gap-3 rounded-xl border border-border bg-popover p-4 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-label="Vælg brugerdefineret farve"
          >
            <div className="flex flex-col gap-1">
              <h3 className="m-0 text-[0.95rem] font-semibold text-foreground">Brugerdefineret farve</h3>
              <p className="m-0 text-sm text-muted-foreground">
                Vælg præcis hue (0-359) til dette fag.
              </p>
            </div>

            <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/45 px-3 py-2.5">
              <div
                className="size-9 shrink-0 rounded-full border-2 border-border bg-[oklch(0.65_0.18_var(--custom-hue,265))]"
                style={{ '--custom-hue': customHue } as React.CSSProperties}
              />
              <div className="font-mono text-sm text-foreground">{customHue}deg</div>
            </div>

            <label className="text-xs font-semibold text-muted-foreground" htmlFor={`custom-hue-${mapping.kind}-${mapping.id}`}>
              Hue
            </label>
            <input
              id={`custom-hue-${mapping.kind}-${mapping.id}`}
              type="range"
              min={0}
              max={359}
              step={1}
              value={customHue}
              onInput={(e) => setCustomHue(normalizeHue(Number((e.target as HTMLInputElement).value)))}
              className="w-full cursor-pointer accent-primary"
            />

            <input
              type="number"
              min={0}
              max={359}
              step={1}
              value={customHue}
              onInput={(e) => setCustomHue(normalizeHue(Number((e.target as HTMLInputElement).value)))}
              className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-ring focus:ring-2 focus:ring-ring/25"
            />

            <div className="flex justify-end gap-2">
              <button
                type="button"
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'cursor-pointer')}
                onClick={() => setShowCustomModal(false)}
              >
                Annuller
              </button>
              <button
                type="button"
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'cursor-pointer')}
                onClick={() => {
                  setHoldColorHue(mapping.id, mapping.kind, null);
                  onUpdate();
                  setShowCustomModal(false);
                  setShowColors(false);
                  void syncHoldMappingOverrideToSupabase(mapping.id).catch((error) => {
                    toast.error(syncErrorMessage('Kunne ikke synkronisere farven', error));
                  });
                }}
              >
                Standard
              </button>
              <button
                type="button"
                className={cn(buttonVariants({ size: 'sm' }), 'cursor-pointer')}
                onClick={() => {
                  setHoldColorHue(mapping.id, mapping.kind, normalizeHue(customHue));
                  onUpdate();
                  setShowCustomModal(false);
                  setShowColors(false);
                  void syncHoldMappingOverrideToSupabase(mapping.id).catch((error) => {
                    toast.error(syncErrorMessage('Kunne ikke synkronisere farven', error));
                  });
                }}
              >
                Gem farve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main editor ─────────────────────────────────────────────────────────
export function HoldMappingEditor() {
  useEffect(() => {
    const studentId = getLoggedInUserId();
    if (!studentId) return;
    captureFeatureUsedOncePerSession('hold_mapping_editor', getDistinctId(studentId));
  }, []);

  const [, setTick] = useState(0);
  const [filter, setFilter] = useState('');
  const forceUpdate = () => setTick((tick) => tick + 1);

  useEffect(() => {
    let cancelled = false;
    void hydrateHoldMappingsFromSupabase().then((changed) => {
      if (changed && !cancelled) {
        forceUpdate();
      }
    }).catch(() => {
      // Ignore auth/offline errors; local mappings still work.
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const allRows = getAllHolds();

  const filteredRows = filter.trim()
    ? allRows.filter((row) => {
        const q = normalizeForSearch(filter);
        return (
          normalizeForSearch(row.displayName).includes(q) ||
          normalizeForSearch(row.codeLabel).includes(q)
        );
      })
    : allRows;

  const subjects = filteredRows;

  const handleResetAll = () => {
    resetAllMappings();
    forceUpdate();
    void Promise.all(allRows.map((row) => syncHoldMappingOverrideToSupabase(row.id))).catch((error) => {
      toast.error(syncErrorMessage('Kunne ikke synkronisere nulstillingen', error));
    });
  };

  if (allRows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
        <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted/60">
          <Palette className="size-8 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">Ingen fag fundet endnu</p>
        <p className="text-sm text-muted-foreground mt-1">
          Besøg dit skema, opgaver eller lektier for at registrere flere holdnøgler.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Klik på et fagnavn for at omdøbe den normaliserede holdnøgle. Klik på farvecirklen for at vælge farve.
            Alle klassevarianter som fx 1x MA og L2d MA samles automatisk under samme nøgle.
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-[15px] -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
            placeholder="Filtrer fag eller holdnøgle..."
            value={filter}
            onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
          />
        </div>
      </div>

      {/* Mappings section */}
      {subjects.length > 0 && (
        <div className="flex flex-col overflow-visible rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border bg-muted/35 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fag og holdnøgler</span>
            <span className="rounded-full bg-muted/70 px-2 py-0.5 text-xs font-semibold text-muted-foreground">{subjects.length}</span>
          </div>
          <div className="flex flex-col [&>*+*]:border-t [&>*+*]:border-border/60">
            {subjects.map((mapping) => (
              <HoldRow
                key={`${mapping.kind}:${mapping.id}`}
                mapping={mapping}
                onUpdate={forceUpdate}
              />
            ))}
          </div>
        </div>
      )}

      {/* No results */}
      {filteredRows.length === 0 && filter.trim() && (
        <p className="text-sm text-muted-foreground text-center py-8">
          Ingen fag eller holdnøgler matcher "{filter}"
        </p>
      )}

      {/* Reset */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleResetAll}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'cursor-pointer')}
        >
          <RotateCcw className="size-3.5 mr-1.5" />
          Nulstil alle navne og farver
        </button>
      </div>
    </div>
  );
}
