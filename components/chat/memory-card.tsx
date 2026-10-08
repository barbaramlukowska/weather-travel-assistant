import { Brain, Eraser } from 'lucide-react';
import type { ForgetOutput, RememberOutput } from './types';
import { CATEGORY_LABELS } from './memory-labels';

interface MemoryCardProps {
  data: RememberOutput | ForgetOutput;
}

// Shown at the moment of writing, so the user sees exactly what the agent
// stored — the panel shows the full list later.
export function MemoryCard({ data }: MemoryCardProps) {
  const label = CATEGORY_LABELS[data.category];
  return (
    <div
      title={label}
      className="assistant-glass flex w-fit max-w-full items-center gap-2.5 rounded-2xl border border-outline-variant/40 px-4 py-2.5 text-[14px] shadow-sm"
    >
      {'saved' in data ? (
        <>
          <Brain size={16} className="shrink-0 text-primary" />
          <span className="font-semibold">Remembered:</span>
          <span>{data.value}</span>
        </>
      ) : (
        <>
          <Eraser size={16} className="shrink-0 text-primary" />
          <span className="font-semibold">Forgot:</span>
          <span>{label.toLowerCase()}</span>
        </>
      )}
    </div>
  );
}
