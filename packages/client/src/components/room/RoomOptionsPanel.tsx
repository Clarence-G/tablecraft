import { Button } from '@/components/ui/button';
import { Minus, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';

export interface RoomOptionsPanelProps {
  /**
   * When the panel is rendered outside the waiting phase nothing is shown.
   * Callers may also skip mounting the panel when the room isn't waiting —
   * this prop is the authoritative gate so the parent doesn't have to branch.
   */
  status: 'waiting' | 'playing' | 'finished';
  isHost: boolean;
  /** Current maxPlayers (room-level override of meta.maxPlayers). */
  currentMaxPlayers: number;
  /** Number of players already seated; lower bound for stepper. */
  currentPlayerCount: number;
  /** Absolute bounds from the game's meta. */
  minPlayers: number;
  maxPlayers: number;
  /** Current per-game config; undefined when the game declares none. */
  currentConfig?: Record<string, unknown>;
  /** Optional zod schema describing per-game options. */
  configSchema?: z.ZodTypeAny;
  onUpdate: (payload: { maxPlayers?: number; config?: Record<string, unknown> }) => void;
}

/**
 * Best-effort inspection of a Zod schema to detect a top-level ZodObject and
 * enumerate its boolean/number leaf fields. Unknown shapes fall through; the
 * panel silently omits options it can't auto-render.
 */
function readObjectShape(schema: z.ZodTypeAny | undefined): Record<string, z.ZodTypeAny> | null {
  if (!schema) return null;
  const def = (schema as { _def?: { typeName?: string; shape?: unknown } })._def;
  if (def?.typeName === 'ZodDefault') {
    const inner = (schema as unknown as { removeDefault: () => z.ZodTypeAny }).removeDefault();
    return readObjectShape(inner);
  }
  if (def?.typeName === 'ZodObject') {
    const shape = (schema as unknown as { shape: Record<string, z.ZodTypeAny> }).shape;
    return shape ?? null;
  }
  return null;
}

function unwrapField(field: z.ZodTypeAny): { kind: 'boolean' | 'number' | 'other' } {
  const def = (field as { _def?: { typeName?: string } })._def;
  const name = def?.typeName;
  if (name === 'ZodDefault' || name === 'ZodOptional' || name === 'ZodNullable') {
    const inner = field as unknown as {
      removeDefault?: () => z.ZodTypeAny;
      unwrap?: () => z.ZodTypeAny;
    };
    const next =
      typeof inner.removeDefault === 'function' ? inner.removeDefault() : inner.unwrap?.();
    if (next) return unwrapField(next);
  }
  if (name === 'ZodBoolean') return { kind: 'boolean' };
  if (name === 'ZodNumber') return { kind: 'number' };
  return { kind: 'other' };
}

export function RoomOptionsPanel({
  status,
  isHost,
  currentMaxPlayers,
  currentPlayerCount,
  minPlayers,
  maxPlayers,
  currentConfig,
  configSchema,
  onUpdate,
}: RoomOptionsPanelProps) {
  const { t } = useTranslation('common');

  if (status !== 'waiting') return null;

  // Lower bound respects both game rule (minPlayers) and the live player count —
  // the server rejects maxPlayers below the current count, so don't let the
  // stepper even propose it.
  const lowerBound = Math.max(minPlayers, currentPlayerCount);
  const canDecrement = isHost && currentMaxPlayers > lowerBound;
  const canIncrement = isHost && currentMaxPlayers < maxPlayers;

  const shape = useMemo(() => readObjectShape(configSchema), [configSchema]);
  const hostOnlyHint = t('room.options.onlyHostCanEdit', {
    defaultValue: 'Only the host can change these options.',
  });

  const handleStep = (delta: 1 | -1) => {
    const next = currentMaxPlayers + delta;
    if (next < lowerBound || next > maxPlayers) return;
    onUpdate({ maxPlayers: next });
  };

  const handleConfigChange = (key: string, value: unknown) => {
    const nextConfig = { ...(currentConfig ?? {}), [key]: value };
    onUpdate({ config: nextConfig });
  };

  return (
    <section
      data-testid="room-options-panel"
      className="bg-card border-thick border-foreground rounded-[16px] p-5 shadow-card"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">
          {t('room.options.title', { defaultValue: 'Room Options' })}
        </h3>
        {!isHost && (
          <span className="text-xs text-muted-foreground italic" title={hostOnlyHint}>
            {hostOnlyHint}
          </span>
        )}
      </div>

      {/* maxPlayers stepper */}
      <div className="flex items-center justify-between gap-3 py-2">
        <span className="text-sm font-medium">
          {t('room.options.maxPlayers', { defaultValue: 'Max players' })}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            data-testid="max-players-decrement"
            aria-label={t('room.options.decrement', { defaultValue: 'Decrease max players' })}
            disabled={!canDecrement}
            onClick={() => handleStep(-1)}
            title={!isHost ? hostOnlyHint : undefined}
          >
            <Minus className="w-4 h-4" />
          </Button>
          <span
            data-testid="max-players-value"
            className="min-w-[2ch] text-center font-mono text-base font-semibold"
          >
            {currentMaxPlayers}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            data-testid="max-players-increment"
            aria-label={t('room.options.increment', { defaultValue: 'Increase max players' })}
            disabled={!canIncrement}
            onClick={() => handleStep(1)}
            title={!isHost ? hostOnlyHint : undefined}
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Auto-generated config fields from configSchema */}
      {shape && (
        <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-foreground/10">
          {Object.entries(shape).map(([key, field]) => {
            const { kind } = unwrapField(field);
            if (kind === 'other') return null;
            const value = currentConfig?.[key];
            return (
              <ConfigField
                key={key}
                name={key}
                kind={kind}
                value={value}
                disabled={!isHost}
                hostOnlyHint={hostOnlyHint}
                onChange={(v) => handleConfigChange(key, v)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function ConfigField({
  name,
  kind,
  value,
  disabled,
  hostOnlyHint,
  onChange,
}: {
  name: string;
  kind: 'boolean' | 'number';
  value: unknown;
  disabled: boolean;
  hostOnlyHint: string;
  onChange: (next: unknown) => void;
}) {
  const { t } = useTranslation('common');
  const label = t(`room.options.config.${name}`, { defaultValue: name });
  const [pending, setPending] = useState<string | null>(null);

  if (kind === 'boolean') {
    const checked = value === true;
    return (
      <label
        className={`flex items-center justify-between gap-3 py-1.5 ${
          disabled ? 'opacity-60 cursor-not-allowed' : ''
        }`}
        title={disabled ? hostOnlyHint : undefined}
      >
        <span className="text-sm font-medium">{label}</span>
        <input
          type="checkbox"
          data-testid={`config-${name}`}
          className="w-4 h-4"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
      </label>
    );
  }

  // number
  const display = pending ?? (typeof value === 'number' ? String(value) : '');
  return (
    <label
      className={`flex items-center justify-between gap-3 py-1.5 ${
        disabled ? 'opacity-60 cursor-not-allowed' : ''
      }`}
      title={disabled ? hostOnlyHint : undefined}
    >
      <span className="text-sm font-medium">{label}</span>
      <input
        type="number"
        data-testid={`config-${name}`}
        className="w-20 h-8 px-2 border-2 border-foreground rounded bg-card disabled:opacity-60"
        value={display}
        disabled={disabled}
        onChange={(e) => setPending(e.target.value)}
        onBlur={() => {
          if (pending === null) return;
          const parsed = Number(pending);
          setPending(null);
          if (!Number.isFinite(parsed)) return;
          onChange(parsed);
        }}
      />
    </label>
  );
}
