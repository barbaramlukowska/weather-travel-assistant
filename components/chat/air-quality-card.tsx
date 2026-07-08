import { MapPin, Wind } from 'lucide-react';
import type { AirQualityOutput } from './types';

interface AirQualityCardProps {
  data: Extract<AirQualityOutput, { found: true }>;
}

// US AQI scale → human label + colour. Same thresholds we tell the model
// about, kept in the UI so the badge colour always matches the words.
function aqiCategory(aqi: number): { label: string; text: string; bg: string } {
  if (aqi <= 50) return { label: 'Good', text: 'text-emerald-600', bg: 'bg-emerald-500/10' };
  if (aqi <= 100) return { label: 'Moderate', text: 'text-amber-600', bg: 'bg-amber-500/10' };
  if (aqi <= 150)
    return { label: 'Unhealthy (sensitive)', text: 'text-orange-600', bg: 'bg-orange-500/10' };
  return { label: 'Unhealthy', text: 'text-red-600', bg: 'bg-red-500/10' };
}

interface StatProps {
  label: string;
  value: string;
}

function Stat({ label, value }: StatProps) {
  return (
    <div className="flex flex-col items-center gap-1 px-2 py-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40">
        {label}
      </p>
      <p className="text-base font-semibold">{value}</p>
    </div>
  );
}

export function AirQualityCard({ data }: AirQualityCardProps) {
  const category = aqiCategory(data.usAqi);

  return (
    <div className="assistant-glass w-full overflow-hidden rounded-4xl border border-outline-variant/40 shadow-sm">
      <div className="flex items-center justify-between gap-6 p-6">
        <div className="flex items-center gap-2 font-semibold text-primary">
          <MapPin size={18} />
          <span className="text-xl font-bold tracking-tight">{data.location}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className={`text-5xl font-bold leading-none tracking-tight ${category.text}`}>
              {data.usAqi}
            </div>
            <p className={`mt-1 text-xs font-bold uppercase tracking-wider ${category.text}`}>
              {category.label}
            </p>
          </div>
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-3xl ${category.bg} ${category.text}`}
          >
            <Wind size={38} />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 divide-x divide-outline-variant/20 border-t border-outline-variant/20 bg-surface-container-low/40">
        <Stat label="PM2.5" value={`${Math.round(data.pm25)} µg/m³`} />
        <Stat label="PM10" value={`${Math.round(data.pm10)} µg/m³`} />
      </div>
    </div>
  );
}
