import { Moon, Sparkles, Sun } from 'lucide-react';

interface ChatHeaderProps {
  isDark: boolean;
  onToggleTheme: () => void;
}

export function ChatHeader({ isDark, onToggleTheme }: ChatHeaderProps) {
  return (
    <header className="shrink-0 border-b border-outline-variant/20 bg-surface/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-2xl items-center gap-2.5 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-primary">
          <Sparkles className="text-on-primary" size={20} />
        </div>
        <h1 className="text-[17px] font-semibold tracking-tight">Aura Travel</h1>
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
        >
          {isDark ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </div>
    </header>
  );
}
