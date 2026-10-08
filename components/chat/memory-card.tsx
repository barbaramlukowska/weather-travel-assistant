import { Brain, Eraser } from 'lucide-react';
import { formatFact } from '@/lib/memory';
import type { ForgetOutput, RememberOutput } from './types';
import { CATEGORY_LABELS } from './memory-labels';

interface MemoryCardProps {
  data: RememberOutput | ForgetOutput;
}

const NOTE_LABEL = 'Note';

// Shown at the moment of writing, so the user sees exactly what the agent
// stored — for a city the geocoder's name, not what the model typed. The
// label matters: "crowds, heat" alone does not say liked or avoided. Notes
// are saved automatically, so this card (and the one line about a note that
// fell out at 10/10) is how the user learns what changed.
export function MemoryCard({ data }: MemoryCardProps) {
  const label = data.category === 'notes' ? NOTE_LABEL : CATEGORY_LABELS[data.category];
  return (
    <div
      title={label}
      className="assistant-glass flex w-fit max-w-full flex-wrap items-center gap-x-2.5 gap-y-1 rounded-2xl border border-outline-variant/40 px-4 py-2.5 text-[14px] shadow-sm"
    >
      {'saved' in data ? (
        <>
          <Brain size={16} className="shrink-0 text-primary" />
          <span className="font-semibold">Remembered:</span>
          <span>
            {label} — {data.category === 'notes' ? data.value.text : formatFact(data)}
          </span>
          {data.category === 'notes' && data.dropped !== undefined && (
            <span className="basis-full pl-6.5 text-[13px] text-on-surface-variant">
              {`Forgot the oldest: "${data.dropped}"`}
            </span>
          )}
        </>
      ) : (
        <>
          <Eraser size={16} className="shrink-0 text-primary" />
          <span className="font-semibold">Forgot:</span>
          <span>{data.category === 'notes' ? `note "${data.note}"` : label.toLowerCase()}</span>
        </>
      )}
    </div>
  );
}
