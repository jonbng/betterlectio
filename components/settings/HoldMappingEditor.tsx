import { useEffect, useRef, useState } from 'react';
import { Pencil, RotateCcw, Sparkles, Search, Palette } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  CURATED_HUES,
  getAllHolds,
  resetAllMappings,
  setHoldColorHue,
  setHoldDisplayName,
  type HoldMappingRow,
} from '@/lib/hold-mapping';

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
    <div className="il-hold-autocomplete-wrapper">
      <input
        ref={inputRef}
        type="text"
        className="il-hold-mapping-input"
        value={editValue}
        onInput={(e) => setEditValue((e.target as HTMLInputElement).value)}
        onBlur={() => {
          // Delay to allow click on suggestion
          setTimeout(() => {
            if (!document.activeElement?.closest('.il-hold-autocomplete-wrapper')) {
              commit();
            }
          }, 150);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Skriv et fagnavn..."
      />
      {showSuggestions && (
        <div ref={listRef} className="il-hold-autocomplete-list">
          {suggestions.map((suggestion, i) => (
            <button
              key={suggestion}
              data-suggestion
              type="button"
              className={cn(
                'il-hold-autocomplete-item',
                i === selectedIndex && 'is-selected',
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
  const colorRef = useRef<HTMLDivElement>(null);

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
    }
    setEditing(false);
  };

  return (
    <div className="il-hold-mapping-row">
      {/* Color dot */}
      <div className="il-hold-mapping-color-cell" ref={colorRef}>
        <button
          type="button"
          className="il-hold-mapping-color-btn"
          style={{ '--hold-hue': mapping.effectiveHue } as any}
          onClick={() => setShowColors(!showColors)}
          title="Skift farve"
        >
          <span className="sr-only">Skift farve</span>
        </button>
        {showColors && (
          <div className="il-hold-color-picker">
            <div className="il-hold-color-picker-label">Vælg farve</div>
            <div className="il-hold-color-picker-grid">
              <button
                type="button"
                className={cn(
                  'il-hold-color-swatch is-default',
                  mapping.colorHue === null && 'is-active',
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  setHoldColorHue(mapping.id, mapping.kind, null);
                  setShowColors(false);
                  onUpdate();
                }}
                title="Standard"
              />
              {CURATED_HUES.map((hue) => (
                <button
                  key={hue}
                  type="button"
                  className={cn(
                    'il-hold-color-swatch',
                    mapping.colorHue === hue && 'is-active',
                  )}
                  style={{ '--swatch-hue': hue } as any}
                  onClick={(e) => {
                    e.stopPropagation();
                    setHoldColorHue(mapping.id, mapping.kind, hue);
                    setShowColors(false);
                    onUpdate();
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Name + code */}
      <div className="il-hold-mapping-content">
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
            className="il-hold-mapping-name-btn"
            onClick={() => setEditing(true)}
            title="Klik for at redigere"
          >
            <span className="il-hold-mapping-name-text">{mapping.displayName}</span>
            {mapping.autoGuessed ? (
              <Sparkles className="il-hold-mapping-indicator" />
            ) : (
              <Pencil className="il-hold-mapping-indicator" />
            )}
          </button>
        )}
        <span className="il-hold-mapping-code">{mapping.codeLabel}</span>
      </div>
    </div>
  );
}

// ── Main editor ─────────────────────────────────────────────────────────
export function HoldMappingEditor() {
  const [, setTick] = useState(0);
  const [filter, setFilter] = useState('');
  const forceUpdate = () => setTick((tick) => tick + 1);

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

  const subjects = filteredRows.filter((r) => r.kind === 'subject');
  const overrides = filteredRows.filter((r) => r.kind === 'override');

  const handleResetAll = () => {
    resetAllMappings();
    forceUpdate();
  };

  if (allRows.length === 0) {
    return (
      <div className="il-hold-editor-empty">
        <div className="il-hold-editor-empty-icon">
          <Palette className="size-8 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">Ingen fag fundet endnu</p>
        <p className="text-sm text-muted-foreground mt-1">
          Besøg dit skema, opgaver eller lektier for at få dem vist her.
        </p>
      </div>
    );
  }

  return (
    <div className="il-hold-editor">
      {/* Header */}
      <div className="il-hold-editor-header">
        <div>
          <p className="text-sm text-muted-foreground">
            Klik på et fagnavn for at omdøbe det. Klik på farvecirklen for at vælge farve.
            Forslag vises mens du skriver.
          </p>
        </div>

        {/* Search */}
        <div className="il-hold-editor-search">
          <Search className="il-hold-editor-search-icon" />
          <input
            type="text"
            className="il-hold-editor-search-input"
            placeholder="Filtrer fag..."
            value={filter}
            onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
          />
        </div>
      </div>

      {/* Subjects section */}
      {subjects.length > 0 && (
        <div className="il-hold-editor-section">
          <div className="il-hold-editor-section-header">
            <span className="il-hold-editor-section-title">Fag</span>
            <span className="il-hold-editor-section-count">{subjects.length}</span>
          </div>
          <div className="il-hold-editor-list">
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

      {/* Overrides section */}
      {overrides.length > 0 && (
        <div className="il-hold-editor-section">
          <div className="il-hold-editor-section-header">
            <span className="il-hold-editor-section-title">Særlige hold</span>
            <span className="il-hold-editor-section-count">{overrides.length}</span>
          </div>
          <div className="il-hold-editor-list">
            {overrides.map((mapping) => (
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
          Ingen fag matcher "{filter}"
        </p>
      )}

      {/* Reset */}
      <div className="il-hold-editor-footer">
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
