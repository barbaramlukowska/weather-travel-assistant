import { Trash2, X } from 'lucide-react';
import { MEMORY_CATEGORIES, type Memory, type MemoryCategory } from '@/lib/memory';
import { CATEGORY_LABELS } from './memory-labels';

interface MemoryPanelProps {
  memory: Memory;
  onForget: (category: MemoryCategory) => void;
  onClear: () => void;
  onClose: () => void;
}

// Non-modal on purpose: the chat stays usable while the panel is open, so
// there is no focus trap to get wrong.
export function MemoryPanel({ memory, onForget, onClear, onClose }: MemoryPanelProps) {
  const entries = MEMORY_CATEGORIES.flatMap((category) => {
    const value = memory[category];
    return value === undefined ? [] : [{ category, value }];
  });

  return (
    <section
      aria-label="Saved preferences"
      className="shrink-0 border-b border-outline-variant/20 bg-surface-container-low/60"
    >
      <div className="mx-auto w-full max-w-2xl px-5 py-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50">
            What I remember about you
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close saved preferences"
            className="flex h-7 w-7 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
          >
            <X size={16} />
          </button>
        </div>

        {entries.length === 0 ? (
          <p className="text-[13px] text-on-surface-variant/70">
            Nothing saved yet. Tell me where you live or what weather you like,
            and I&apos;ll remember it.
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {entries.map(({ category, value }) => (
                <li key={category} className="flex items-center justify-between gap-3 text-[14px]">
                  <p className="min-w-0">
                    <span className="font-semibold">{CATEGORY_LABELS[category]}</span>{' '}
                    <span className="text-on-surface-variant">{value}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => onForget(category)}
                    aria-label={`Forget ${CATEGORY_LABELS[category].toLowerCase()}`}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-error"
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={onClear}
              className="mt-3 text-[13px] font-semibold text-error hover:opacity-70"
            >
              Clear all
            </button>
          </>
        )}

        <p className="mt-3 text-[11px] text-on-surface-variant/50">
          Stored only in this browser. Sent with each message, never saved on the server.
        </p>
      </div>
    </section>
  );
}
