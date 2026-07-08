import { Check, Luggage, Plane } from 'lucide-react';
import type { TripPlanOutput } from './types';

interface TripPlanCardProps {
  data: Extract<TripPlanOutput, { found: true }>;
}

export function TripPlanCard({ data }: TripPlanCardProps) {
  return (
    <div className="assistant-glass w-full overflow-hidden rounded-4xl border border-outline-variant/40 shadow-sm">
      <div className="flex items-center justify-between gap-4 p-6 pb-4">
        <div className="flex items-center gap-2 font-semibold text-primary">
          <Plane size={18} />
          <span className="text-xl font-bold tracking-tight">{data.city}</span>
        </div>
        <Luggage className="text-primary/60" size={22} />
      </div>

      <p className="px-6 pb-5 text-[15px] leading-relaxed text-on-surface-variant/90">
        {data.summary}
      </p>

      <div className="border-t border-outline-variant/20 bg-surface-container-low/40 px-6 py-4">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50">
          Packing list
        </p>
        <ul className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {data.packingList.map((item) => (
            <li key={item} className="flex items-center gap-2 text-[14px] font-medium">
              <Check className="shrink-0 text-primary/70" size={15} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
