import { useState, useRef } from 'preact/hooks';
import { Sparkles, Pencil, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SettingsSection } from '@/components/settings/SettingsSection';
import {
  getAllHolds,
  setHoldDisplayName,
  setHoldColorHue,
  resetAllMappings,
  getHoldHue,
  CURATED_HUES,
  type HoldMapping,
} from '@/lib/hold-mapping';

function HoldRow({ mapping, onUpdate }: { mapping: HoldMapping; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(mapping.displayName);
  const [showColors, setShowColors] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const effectiveHue = mapping.colorHue ?? getHoldHue(mapping.holdCode);

  const commitEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== mapping.displayName) {
      setHoldDisplayName(mapping.holdCode, trimmed);
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
      {/* Hold code */}
      <span className="il-hold-mapping-code">{mapping.holdCode}</span>

      {/* Display name (editable) */}
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

      {/* Color button */}
      <div className="il-hold-mapping-color-cell">
        <button
          className="il-hold-mapping-color-btn"
          style={{ '--hold-hue': effectiveHue } as any}
          onClick={() => setShowColors(!showColors)}
          title="Skift farve"
        />
        {showColors && (
          <div className="il-hold-color-picker">
            <button
              className={`il-hold-color-swatch is-default${mapping.colorHue === null ? ' is-active' : ''}`}
              onClick={() => { setHoldColorHue(mapping.holdCode, null); setShowColors(false); onUpdate(); }}
              title="Standard"
            />
            {CURATED_HUES.map(hue => (
              <button
                key={hue}
                className={`il-hold-color-swatch${mapping.colorHue === hue ? ' is-active' : ''}`}
                style={{ '--swatch-hue': hue } as any}
                onClick={() => { setHoldColorHue(mapping.holdCode, hue); setShowColors(false); onUpdate(); }}
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
  const forceUpdate = () => setTick(t => t + 1);

  const holds = getAllHolds();

  const handleResetAll = () => {
    resetAllMappings();
    forceUpdate();
  };

  if (holds.length === 0) {
    return (
      <SettingsSection title="Fag" description="Administrer dine holds visningsnavne og farver">
        <div className="py-6 px-4 text-center">
          <p className="text-sm text-muted-foreground">
            Ingen hold opdaget endnu. Besøg dit skema, opgaver eller lektier for at opdage hold automatisk.
          </p>
        </div>
      </SettingsSection>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsSection title="Fag" description="Klik på et navn for at redigere det. Farver kan ændres med den farvede cirkel.">
        {holds.map(mapping => (
          <HoldRow
            key={mapping.holdCode}
            mapping={mapping}
            onUpdate={forceUpdate}
          />
        ))}
      </SettingsSection>

      <div className="flex justify-end px-1">
        <Button
          variant="outline"
          size="sm"
          onClick={handleResetAll}
          className="cursor-pointer"
        >
          <RotateCcw className="size-3.5 mr-1.5" />
          Nulstil alle navne
        </Button>
      </div>
    </div>
  );
}
