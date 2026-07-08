import { AlertCircle, CalendarDays, Cloud, Wind, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { UIMessage } from 'ai';
import type {
  AirQualityOutput,
  ForecastOutput,
  ToolOutput,
  ToolPart,
  WeatherOutput,
} from './types';
import { WeatherCard } from './weather-card';
import { ForecastCard } from './forecast-card';
import { AirQualityCard } from './air-quality-card';

interface ChipProps {
  icon: LucideIcon;
  children: ReactNode;
  variant?: 'active' | 'error';
}

function Chip({ icon: Icon, children, variant = 'active' }: ChipProps) {
  const styles =
    variant === 'error'
      ? 'border-error/20 bg-status-error-bg text-status-error-text'
      : 'border-outline-variant/40 bg-surface-container-low/50 text-on-surface-variant/80 animate-pulse';
  return (
    <div
      className={`flex items-center gap-2.5 rounded-full border px-4 py-2 ${styles}`}
    >
      <Icon size={16} />
      <span className="text-[11px] font-bold uppercase tracking-widest">{children}</span>
    </div>
  );
}

// One state machine for every tool: loading chip → success card → "not found"
// chip → error chip. Each tool only supplies its icon, labels, and card.
interface ToolCallProps<T extends ToolOutput> {
  part: ToolPart<T>;
  icon: LucideIcon;
  loadingLabel: string;
  errorLabel: string;
  renderCard: (output: Extract<T, { found: true }>) => ReactNode;
}

function ToolCall<T extends ToolOutput>({
  part,
  icon,
  loadingLabel,
  errorLabel,
  renderCard,
}: ToolCallProps<T>) {
  const city = part.input?.city ?? '…';

  if (part.state === 'input-streaming' || part.state === 'input-available') {
    return (
      <Chip icon={icon}>
        {loadingLabel} {city}
      </Chip>
    );
  }
  if (part.state === 'output-available' && part.output) {
    if (part.output.found) {
      return (
        <div className="w-full max-w-[92%]">
          {renderCard(part.output as Extract<T, { found: true }>)}
        </div>
      );
    }
    return (
      <Chip icon={AlertCircle} variant="error">
        Couldn&apos;t find “{part.output.city}”
      </Chip>
    );
  }
  if (part.state === 'output-error') {
    return (
      <Chip icon={AlertCircle} variant="error">
        {errorLabel}
      </Chip>
    );
  }
  return null;
}

interface MessageItemProps {
  message: UIMessage;
}

export function MessageItem({ message }: MessageItemProps) {
  return (
    <div
      className={
        message.role === 'user'
          ? 'flex flex-col items-end gap-2'
          : 'flex flex-col items-start gap-2'
      }
    >
      {message.parts.map((part, i) => {
        if (part.type === 'text') {
          return (
            <div
              key={i}
              className={
                message.role === 'user'
                  ? 'bubble-user max-w-[85%] bg-user-bubble px-5 py-3 text-[15px] leading-relaxed text-white shadow-md'
                  : 'bubble-assistant assistant-glass max-w-[85%] border border-outline-variant/30 px-5 py-3 text-[15px] leading-relaxed shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
              }
            >
              {part.text}
            </div>
          );
        }

        // Each tool matches its own part type and hands ToolCall the card to
        // render on success. The shared states (loading / not-found / error)
        // live in ToolCall, so adding a tool is one small block.
        if (part.type === 'tool-getWeather') {
          return (
            <ToolCall
              key={i}
              part={part as unknown as ToolPart<WeatherOutput>}
              icon={Cloud}
              loadingLabel="Checking weather in"
              errorLabel="Weather lookup failed"
              renderCard={(output) => <WeatherCard data={output} />}
            />
          );
        }
        if (part.type === 'tool-getForecast') {
          return (
            <ToolCall
              key={i}
              part={part as unknown as ToolPart<ForecastOutput>}
              icon={CalendarDays}
              loadingLabel="Fetching forecast for"
              errorLabel="Forecast lookup failed"
              renderCard={(output) => <ForecastCard data={output} />}
            />
          );
        }
        if (part.type === 'tool-getAirQuality') {
          return (
            <ToolCall
              key={i}
              part={part as unknown as ToolPart<AirQualityOutput>}
              icon={Wind}
              loadingLabel="Checking air quality in"
              errorLabel="Air quality lookup failed"
              renderCard={(output) => <AirQualityCard data={output} />}
            />
          );
        }

        return null;
      })}
    </div>
  );
}
