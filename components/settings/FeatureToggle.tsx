import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface FeatureToggleProps {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
  disabledReason?: string;
  hasDependent?: boolean;
  requiresReload?: boolean;
}

export function FeatureToggle({
  id,
  label,
  description,
  enabled,
  onChange,
  disabled = false,
  disabledReason,
  hasDependent = false,
  requiresReload = false,
}: FeatureToggleProps) {
  return (
    <div className={`flex items-center justify-between py-3 px-4 ${disabled ? 'opacity-50' : ''}`}>
      <div className="space-y-0.5 pr-4">
        <div className="flex items-center gap-2">
          <Label
            htmlFor={id}
            className={`font-medium ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {label}
          </Label>
          {requiresReload && (
            <span title="Kræver genindlæsning"><RefreshCw className="size-3.5 text-muted-foreground" /></span>
          )}
          {hasDependent && enabled && (
            <span title="Andre funktioner afhænger af denne"><AlertCircle className="size-3.5 text-amber-500" /></span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {disabled && disabledReason ? disabledReason : description}
        </p>
      </div>
      <Switch
        id={id}
        checked={enabled}
        onCheckedChange={onChange}
        disabled={disabled}
        className="cursor-pointer"
      />
    </div>
  );
}
