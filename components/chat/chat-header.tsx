import { Brain, Moon, Sparkles, Sun } from 'lucide-react';

interface ChatHeaderProps {
  isDark: boolean;
  onToggleTheme: () => void;
  memoryCount: number;
  isMemoryOpen: boolean;
  onToggleMemory: () => void;
}

export function ChatHeader({
  isDark,
  onToggleTheme,
  memoryCount,
  isMemoryOpen,
  onToggleMemory,
}: ChatHeaderProps) {
  return (
    <header className="shrink-0 border-b border-outline-variant/20 bg-surface/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-2xl items-center gap-2.5 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-primary">
          <Sparkles className="text-on-primary" size={20} />
        </div>
        <div className="flex flex-col">
          <h1 className="text-[17px] font-semibold tracking-tight leading-tight">Aura Travel</h1>
          <p className="text-[12px] text-on-surface-variant/60 leading-tight">
            Weather, forecasts &amp; air quality — live data
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleMemory}
            aria-expanded={isMemoryOpen}
            aria-label={`Saved preferences (${memoryCount})`}
            className="relative flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
          >
            <Brain size={20} />
            {memoryCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-on-primary"
              >
                {memoryCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
          >
            {isDark ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </div>
    </header>
  );
}
