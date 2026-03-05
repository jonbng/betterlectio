import { useRef, useState } from 'react';
import { Pencil, RotateCcw, Sparkles } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { cn } from '@/lib/utils';
import {
  CURATED_HUES,
  getAllHolds,
  resetAllMappings,
  setHoldColorHue,
  setHoldDisplayName,
  type HoldMappingRow,
} from '@/lib/hold-mapping';

function HoldRow({ mapping, onUpdate }: { mapping: HoldMappingRow; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(mapping.displayName);
  const [showColors, setShowColors] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const commitEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== mapping.displayName) {
      setHoldDisplayName(mapping.id, mapping.kind, trimmed);
      onUpdate();
    }
    setEditing(false);
  };

  const startEdit = () => {
    setEditValue(mapping.displayName);
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div className="il-hold-mapping-row">
      <div className="il-hold-mapping-meta">
        <div className="il-hold-mapping-meta-top">
          <span className="il-hold-mapping-code">{mapping.codeLabel}</span>
        </div>
      </div>

      <div className="il-hold-mapping-name-cell">
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            className="il-hold-mapping-input"
            value={editValue}
            onInput={(e) => setEditValue((e.target as HTMLInputElement).value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEdit();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <button
            className="il-hold-mapping-name-btn"
            onClick={startEdit}
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
      </div>

      <div className="il-hold-mapping-color-cell">
        <button
          className="il-hold-mapping-color-btn"
          style={{ '--hold-hue': mapping.effectiveHue } as any}
          onClick={() => setShowColors(!showColors)}
          title="Skift farve"
        />
        {showColors && (
          <div className="il-hold-color-picker">
            <button
              className={`il-hold-color-swatch is-default${mapping.colorHue === null ? ' is-active' : ''}`}
              onClick={() => {
                setHoldColorHue(mapping.id, mapping.kind, null);
                setShowColors(false);
                onUpdate();
              }}
              title="Standard"
            />
            {CURATED_HUES.map((hue) => (
              <button
                key={hue}
                className={`il-hold-color-swatch${mapping.colorHue === hue ? ' is-active' : ''}`}
                style={{ '--swatch-hue': hue } as any}
                onClick={() => {
                  setHoldColorHue(mapping.id, mapping.kind, hue);
                  setShowColors(false);
                  onUpdate();
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function HoldMappingEditor() {
  const [, setTick] = useState(0);
  const forceUpdate = () => setTick((tick) => tick + 1);

  const rows = getAllHolds();

  const handleResetAll = () => {
    resetAllMappings();
    forceUpdate();
  };

  if (rows.length === 0) {
    return (
      <SettingsSection title="Fag" description="Vælg hvad dine fag skal hedde og hvilken farve de skal have i BetterLectio.">
        <div className="py-6 px-4 text-center">
          <p className="text-sm text-muted-foreground">
            Ingen fag fundet endnu. Besøg dit skema, opgaver eller lektier for at få dem vist her.
          </p>
        </div>
      </SettingsSection>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsSection
        title="Fag"
        description="Klik på et navn for at ændre teksten. Klik på farvecirklen for at vælge en anden farve."
      >
        {rows.map((mapping) => (
          <HoldRow
            key={`${mapping.kind}:${mapping.id}`}
            mapping={mapping}
            onUpdate={forceUpdate}
          />
        ))}
      </SettingsSection>

      <div className="flex justify-end px-1">
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
