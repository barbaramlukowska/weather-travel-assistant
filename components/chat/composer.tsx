import { ArrowUp, Square } from 'lucide-react';

interface ComposerProps {
  input: string;
  isBusy: boolean;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
}

export function Composer({ input, isBusy, onInputChange, onSubmit, onStop }: ComposerProps) {
  return (
    <div className="shrink-0 bg-linear-to-t from-surface via-surface to-transparent pt-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="mx-auto w-full max-w-2xl px-5 pb-5"
      >
        <div className="flex items-center gap-2 rounded-full border border-outline-variant/40 bg-surface-container-lowest p-2 pl-6 shadow-lg shadow-black/3 transition-colors focus-within:border-primary/40">
          <input
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder="Ask about weather, forecast or air quality in any city…"
            disabled={isBusy}
            aria-label="Message"
            className="flex-1 bg-transparent py-2 text-[15px] placeholder:text-on-surface-variant/40 focus:outline-none disabled:opacity-60"
          />
          {isBusy ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop generating"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-outline-variant/50 bg-surface-container-low/50 text-on-surface-variant/70 transition-colors hover:bg-error/10 hover:text-error"
            >
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button
              type="submit"
              aria-label="Send"
              disabled={!input.trim()}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-on-primary shadow-lg shadow-primary/25 transition-transform hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
            >
              <ArrowUp size={22} />
            </button>
          )}
        </div>
        <p className="mt-3 text-center text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/30">
          AI assistant • Verify travel details independently
        </p>
      </form>
    </div>
  );
}
