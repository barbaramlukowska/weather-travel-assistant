import {
  CloudSun,
  Droplets,
  MapPin,
  Thermometer,
  Wind,
  type LucideIcon,
} from 'lucide-react';
import type { WeatherOutput } from './types';

interface StatProps {
  icon: LucideIcon;
  label: string;
  value: string;
}

function Stat({ icon: Icon, label, value }: StatProps) {
  return (
    <div className="flex flex-col items-center gap-2 px-2 py-5">
      <Icon className="text-on-surface-variant/40" size={20} />
      <div className="text-center">
        <p className="mb-0.5 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40">
          {label}
        </p>
        <p className="text-base font-semibold">{value}</p>
      </div>
    </div>
  );
}

interface WeatherCardProps {
  data: Extract<WeatherOutput, { found: true }>;
}

export function WeatherCard({ data }: WeatherCardProps) {
  return (
    <div className="assistant-glass w-full overflow-hidden rounded-4xl border border-outline-variant/40 shadow-sm">
      <div className="flex items-center justify-between gap-6 p-6">
        <div className="flex items-center gap-2 font-semibold text-primary">
          <MapPin size={18} />
          <span className="text-xl font-bold tracking-tight">{data.location}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-5xl font-bold leading-none tracking-tight">
            {Math.round(data.temperature)}
            {data.units.temperature}
          </div>
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/5 text-primary">
            <CloudSun size={38} />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 divide-x divide-outline-variant/20 border-t border-outline-variant/20 bg-surface-container-low/40">
        <Stat
          icon={Thermometer}
          label="Feels like"
          value={`${Math.round(data.feelsLike)}${data.units.temperature}`}
        />
        <Stat icon={Droplets} label="Precip." value={`${data.precipitation} mm`} />
        <Stat
          icon={Wind}
          label="Wind"
          value={`${Math.round(data.windSpeed)} ${data.units.windSpeed}`}
        />
      </div>
    </div>
  );
}
