import { CalendarDays, Droplets, MapPin } from 'lucide-react';
import type { ForecastOutput } from './types';

interface ForecastCardProps {
  data: Extract<ForecastOutput, { found: true }>;
}

export function ForecastCard({ data }: ForecastCardProps) {
  return (
    <div className="assistant-glass w-full overflow-hidden rounded-4xl border border-outline-variant/40 shadow-sm">
      <div className="flex items-center justify-between gap-4 p-6 pb-4">
        <div className="flex items-center gap-2 font-semibold text-primary">
          <MapPin size={18} />
          <span className="text-xl font-bold tracking-tight">{data.location}</span>
        </div>
        <CalendarDays className="text-primary/60" size={22} />
      </div>

      {/* 7 days rarely fit side by side, so the row scrolls horizontally
          rather than forcing the page body to scroll. */}
      <div className="flex gap-2 overflow-x-auto border-t border-outline-variant/20 bg-surface-container-low/40 px-4 py-4">
        {data.days.map((day) => (
          <div
            key={day.date}
            className="flex min-w-[68px] flex-col items-center gap-2 rounded-2xl px-2 py-2"
          >
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50">
              {day.weekday.slice(0, 3)}
            </p>
            <p className="text-base font-semibold leading-none">
              {Math.round(day.maxTemp)}
              {data.units.temperature}
            </p>
            <p className="text-[13px] font-medium leading-none text-on-surface-variant/50">
              {Math.round(day.minTemp)}
              {data.units.temperature}
            </p>
            <div className="flex items-center gap-1 text-primary/70">
              <Droplets size={12} />
              <span className="text-[11px] font-semibold">
                {day.precipitationChance}
                {data.units.precipitationChance}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
