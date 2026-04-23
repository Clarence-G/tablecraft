import { useState } from 'react';

interface QuickJoinInputProps {
  placeholder?: string;
  onSubmit: (code: string) => void;
  buttonLabel?: string;
  /** Max characters. Most room codes are 6. */
  maxLength?: number;
}

/**
 * Uppercase room-code input with an inline submit button. Enter submits.
 * Reuses the skeuomorphic inset input + button styling from the current Lobby.
 */
export function QuickJoinInput({
  placeholder = 'Room code',
  onSubmit,
  buttonLabel = 'Join',
  maxLength = 6,
}: QuickJoinInputProps) {
  const [code, setCode] = useState('');

  function submit() {
    const trimmed = code.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  }

  return (
    <div className="inline-flex items-center gap-2">
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        placeholder={placeholder}
        maxLength={maxLength}
        data-testid="quickjoin-input"
        className="w-28 uppercase tracking-widest border-2 border-border bg-card shadow-inset rounded-[8px] text-center text-sm h-9 px-2 outline-none focus-visible:border-foreground"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!code.trim()}
        data-testid="quickjoin-submit"
        className="shadow-button hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-button border-2 border-foreground bg-primary text-primary-foreground rounded-[8px] px-3 font-semibold text-sm h-9 transition-all"
      >
        {buttonLabel}
      </button>
    </div>
  );
}
